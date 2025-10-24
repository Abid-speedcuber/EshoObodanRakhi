// Authentication Module
window.AuthModule = {
  async handleAuthStateChange() {
    // Get current session (works for both password sign-in and OAuth stored session)
    const { data: { session } } = await db.auth.getSession();
    App.state.currentUser = session?.user || null;

    if (App.state.currentUser) {
      // Try to fetch profile row in 'users' table
      const { data, error } = await db.from('users').select('name, role').eq('id', App.state.currentUser.id).single();

      if (error && error.code === 'PGRST116') {
        // single() returns error if no rows – we'll handle missing profile below
      }

      if (!data) {
        // No profile row found: try to create one (use user's metadata or email as name fallback)
        const profileName = (App.state.currentUser.user_metadata && (App.state.currentUser.user_metadata.full_name || App.state.currentUser.user_metadata.name)) || App.state.currentUser.email || 'User';
        const { error: insertError } = await db.from('users').insert({
          id: App.state.currentUser.id,
          name: profileName,
          email: App.state.currentUser.email,
          role: 'user'
        });
        if (insertError) {
          console.error('Failed to create users profile:', insertError);
          // not fatal – continue
          App.state.userProfile = { id: App.state.currentUser.id, name: profileName, role: 'user' };
          App.state.isAdmin = false;
        } else {
          App.state.userProfile = { id: App.state.currentUser.id, name: profileName, role: 'user' };
          App.state.isAdmin = false;
        }
      } else {
        App.state.userProfile = { id: App.state.currentUser.id, ...data };
        App.state.isAdmin = data?.role === 'admin';
      }

      // Cache auth state for offline access
      localStorage.setItem('authState', JSON.stringify({
        userProfile: App.state.userProfile,
        isAdmin: App.state.isAdmin
      }));

      // Sync notes from server if user has access to notes
      if (App.canAccessNotes()) {
        await App.syncNotesFromServer();
      }
    } else {
      App.state.userProfile = null;
      App.state.isAdmin = false;
      // Clear cached auth state
      localStorage.removeItem('authState');
    }

    App.updateUI();

    // Set initial section based on admin status
    if (App.state.isAdmin) {
      App.showSection('fund');
      // Force hide fund tabs and show collection view for admin
      if (App.elements.fundTabs) {
        App.elements.fundTabs.classList.add('hide');
      }
      if (App.elements.collectionView) {
        App.elements.collectionView.classList.remove('hide');
      }
      if (App.elements.sadakahListView) {
        App.elements.sadakahListView.classList.add('hide');
      }
    } else {
      App.showSection('blood');
    }

    App.loadDataForActiveSection();
    App.calculateTotalFund();
  },

  async signup(name, emailOrPhone, password) {
    // Detect if input is phone number
    const isPhone = /^[\d+]/.test(emailOrPhone.trim());

    let signupResult;
    if (isPhone) {
      const phone = emailOrPhone.startsWith('+') ? emailOrPhone : `+88${emailOrPhone}`;
      signupResult = await db.auth.signUp({ phone, password });
    } else {
      signupResult = await db.auth.signUp({ email: emailOrPhone, password });
    }

    if (signupResult.error) {
      App.hideAllModals();
      return App.showNotification(signupResult.error.message, true);
    }

    const { error: profileError } = await db.from('users').insert({
      id: signupResult.data.user.id,
      name,
      email: isPhone ? null : emailOrPhone,
      role: 'user'
    });

    if (profileError) {
      App.hideAllModals();
      return App.showNotification(profileError.message, true);
    }

    App.hideAllModals();
    if (isPhone) {
      App.showNotification('Account created! Check your phone for OTP verification code.');
    } else {
      App.showNotification('Account created! Activate your account from the email we sent you through Supabase and then login with your credentials.');
    }
    setTimeout(() => App.showModal('loginModal'), 1000);
  },

  async login(emailOrPhone, password) {
    // Detect if input is phone number (starts with + or contains only digits)
    const isPhone = /^[\d+]/.test(emailOrPhone.trim());

    let authResult;
    if (isPhone) {
      // For phone login, we need to use signInWithPassword with phone format
      const phone = emailOrPhone.startsWith('+') ? emailOrPhone : `+88${emailOrPhone}`;
      authResult = await db.auth.signInWithPassword({ phone, password });
    } else {
      authResult = await db.auth.signInWithPassword({ email: emailOrPhone, password });
    }

    if (authResult.error) {
      App.hideAllModals();
      return App.showNotification(authResult.error.message, true);
    }
    App.hideAllModals();
    App.showNotification('Login successful!');
    this.handleAuthStateChange();
  },

  // Start OAuth sign-in flow with Google
  async signInWithGoogle() {
    try {
      // Detect if running in native app or web
      const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.();

      if (isNative) {
        // For mobile app: use skipBrowserRedirect to get the OAuth URL
        const { data, error } = await db.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'com.eor.app://oauth',
            skipBrowserRedirect: true
          }
        });

        if (error) {
          App.showNotification(error.message, true);
          return;
        }

        // Open the OAuth URL in system browser
        const { Browser } = window.Capacitor.Plugins;
        await Browser.open({ url: data.url, presentationStyle: 'popover' });

        App.showNotification('Redirecting to Google...');
      } else {
        // For web: normal OAuth flow
        const { error } = await db.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });

        if (error) {
          App.showNotification(error.message, true);
        } else {
          App.showNotification('Redirecting to Google for sign-in...');
        }
      }
    } catch (err) {
      console.error('Google sign-in error', err);
      App.showNotification('Google sign-in failed: ' + err.message, true);
    }
  },

  async logout() {
    await db.auth.signOut();
    App.showNotification('Logging out...');
    // Refresh page and redirect to blood donation
    setTimeout(() => {
      window.location.href = window.location.origin + '/?section=blood';
      window.location.reload();
    }, 500);
  }
};