// Blood Donors Module
window.BloodModule = {
  async loadDonors() {
    if (App.state.isLoading.donors) return;
    App.state.isLoading.donors = true;
    App.renderLoader('blood');
    
    // Reset filters when loading donors
    document.getElementById('bloodFilter').value = 'all';
    document.getElementById('bloodSearch').value = '';
    document.getElementById('bloodSearch').classList.add('hide');
    document.getElementById('bloodFilter').classList.remove('hide');
    document.getElementById('bloodSearchBtn').classList.remove('hide');
    document.getElementById('bloodClearBtn').classList.add('hide');
    
    try {
      const { data, error } = await db.from('donors').select('*').order('name');
      if (error) throw error;
      localStorage.setItem('donorsData', JSON.stringify(data));
      App.state.allDonors = data || [];
    } catch {
      App.state.allDonors = JSON.parse(localStorage.getItem('donorsData') || '[]');
    }
    // Render donors (shuffling will be handled in filterAndRenderDonors)
    this.filterAndRenderDonors();

    // Check if non-admin user has donor profile and show/hide prompt
    const promptMsg = document.getElementById('donorPromptMessage');
    if (promptMsg) {
      const isBn = localStorage.getItem('lang') === 'bn';
      // Hide prompt for admins
      if (App.state.isAdmin) {
        promptMsg.classList.add('hide');
      } else if (!App.state.currentUser) {
        // Show for non-logged-in users
        promptMsg.classList.remove('hide');
        promptMsg.textContent = isBn ? 'ব্লাড ডোনার তালিকায় যুক্ত হতে লগইন করে আপনার ব্লাড ডোনার প্রোফাইল কমপ্লিট করুন' : 'To be a blood donor, login and complete your donor profile';
      } else {
        // For logged-in non-admin users, check if they have a profile
        try {
          const { data } = await db.from('donors').select('*').eq('user_id', App.state.currentUser.id).single();
          if (!data) {
            promptMsg.classList.remove('hide');
            promptMsg.textContent = isBn ? 'ব্লাড ডোনার হতে "আমার প্রোফাইল" ক্লিক করে আপনার ফোন নম্বর এবং লোকেশন যুক্ত করুন' : 'To be a blood donor, click on "My Profile" and add your phone number and location.';
          } else {
            promptMsg.classList.add('hide');
          }
        } catch {
          // If error checking profile, show prompt
          promptMsg.classList.remove('hide');
          promptMsg.textContent = isBn ? 'ব্লাড ডোনার হতে "আমার প্রোফাইল" ক্লিক করে আপনার ফোন নম্বর এবং লোকেশন যুক্ত করুন' : 'To be a blood donor, click on "My Profile" and add your phone number and location.';
        }
      }
    }

    App.state.isLoading.donors = false;
  },

  highlightMatch(text, searchTerm) {
    if (!searchTerm || !text) return text;

    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background-color: #fef08a; padding: 2px 0;">$1</mark>');
  },

  filterAndRenderDonors() {
    const filterValue = document.getElementById('bloodFilter').value;
    const searchValue = document.getElementById('bloodSearch').value.trim().toLowerCase();

    let filteredDonors = App.state.allDonors;

    // Apply blood group filter
    if (filterValue !== 'all') {
      filteredDonors = filteredDonors.filter(d => d.blood_group === filterValue);
    }

    // Apply search filter
    if (searchValue) {
      filteredDonors = filteredDonors.filter(d => {
        const name = (d.name || '').toLowerCase();
        const phone = (d.phone || '').toLowerCase();
        const location = (d.location || '').toLowerCase();
        const bloodGroup = (d.blood_group || '').toLowerCase();

        return name.includes(searchValue) ||
          phone.includes(searchValue) ||
          location.includes(searchValue) ||
          bloodGroup.includes(searchValue);
      });
    }

    // Sort: unavailable donors at the end
    filteredDonors = this.sortDonorsByAvailability(filteredDonors);
    
    // Randomize the donor list only if not searching and user is not admin
    if (!searchValue && !App.state.isAdmin) {
      filteredDonors = this.shuffleAvailableDonors(filteredDonors);
    }

    if (filteredDonors.length === 0) {
      App.elements.donorsList.innerHTML = `<div class="text-gray-400 text-center py-8">No donors found</div>`;
      return;
    }

    const isBn = localStorage.getItem('lang') === 'bn';
    App.elements.donorsList.innerHTML = filteredDonors.map(donor => {
      const isAdminProfile = donor.created_by_admin;
      
      // Check if donor is within 100 days of last donation
      let isRecentlyDonated = false;
      let daysSinceDonation = null;
      if (donor.last_donated) {
        const lastDonatedDate = new Date(donor.last_donated);
        const today = new Date();
        const diffTime = today - lastDonatedDate;
        daysSinceDonation = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        isRecentlyDonated = daysSinceDonation < 100;
      }
      
      // Determine actual availability (override if recently donated)
      const actuallyAvailable = donor.available && !isRecentlyDonated;
      
      const availableClass = actuallyAvailable ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300';
      const availableText = actuallyAvailable ? (isBn ? '✔অ্যাভেইলেবল' : '✔ Available') : (isBn ? '✖ অ্যাভেইলেবল নয়' : '✖ Not Available');
      const availableColor = actuallyAvailable ? 'text-green-700' : 'text-gray-500';
      const nameColor = isAdminProfile ? 'text-gray-500' : 'text-gray-800';
      const adminBadge = isAdminProfile ? '<span class="text-xs bg-gray-300 text-gray-700 px-2 py-1 rounded ml-2">Admin</span>' : '';

      const searchValue = document.getElementById('bloodSearch').value.trim().toLowerCase();
      const highlightedName = searchValue ? this.highlightMatch(donor.name, searchValue) : donor.name;
      const highlightedLocation = searchValue ? this.highlightMatch(donor.location || 'N/A', searchValue) : (donor.location || 'N/A');
      const highlightedPhone = searchValue ? this.highlightMatch(donor.phone || 'N/A', searchValue) : (donor.phone || 'N/A');
      const highlightedBloodGroup = searchValue ? this.highlightMatch(donor.blood_group, searchValue) : donor.blood_group;

      return `
        <div class="bg-white rounded-xl shadow-lg p-3 border-l-4 ${availableClass}">
          <div class="flex justify-between items-start mb-2">
            <div>
              <div class="flex items-center">
                <h3 class="font-bold text-lg ${nameColor}">${highlightedName}${!actuallyAvailable ? ' <span class="text-sm font-normal text-gray-500">(not available)</span>' : ''}</h3>
              </div>
              <div class="text-sm text-gray-600 flex items-center gap-1"><img src="svgs/icon-location.svg"> ${highlightedLocation}</div>
              ${donor.last_donated ? `<div class="text-xs text-gray-500 mt-1">${isBn ? 'শেষ দান' : 'Last donated'}: ${new Date(donor.last_donated).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}${isRecentlyDonated ? ` <span class="text-orange-600">(${isBn ? daysSinceDonation + ' দিন আগে' : daysSinceDonation + ' days ago'})</span>` : ''}</div>` : ''}
            </div>
            <div class="text-2xl font-bold text-red-600">${highlightedBloodGroup}</div>
          </div>
          <div>
            <div class="flex items-center justify-between">
              <a href="tel:${donor.phone}" class="text-sm text-gray-700 hover:text-blue-600 flex items-center gap-1"><img src="svgs/icon-call.svg"> ${highlightedPhone}</a>
              <div class="flex gap-1">
                <button class="copy-phone-btn text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition" data-phone="${donor.phone}"><img src="svgs/icon-copy.svg"></button>
                ${App.state.isAdmin ? `<button class="edit-donor-btn text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition" data-donor-id="${donor.id}"><img src="svgs/icon-edit.svg"></button>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind event listeners for dynamic buttons
    document.querySelectorAll('.copy-phone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.phone).then(() => App.showNotification('Copied!'));
      });
    });

    document.querySelectorAll('.edit-donor-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const donorId = btn.dataset.donorId;
        await this.populateDonorForm(donorId);
        App.showModal('donorProfileModal');
      });
    });
  },

  async populateDonorForm(donorId = null) {
    const form = document.getElementById('donorProfileForm');
    form.reset();
    App.elements.deleteDonorBtn.classList.add('hide');
    document.getElementById('donorId').value = '';

    if (donorId) {
      // Admin editing someone else's profile
      const { data } = await db.from('donors').select('*').eq('id', donorId).single();
      if (data) {
        form.elements.donorName.value = data.name || '';
        form.elements.donorPhone.value = data.phone || '';
        form.elements.donorBloodGroup.value = data.blood_group || '';
        form.elements.donorLocation.value = data.location || '';
        form.elements.donorAvailable.checked = data.available;
        
        // Handle last donated
        const hasLastDonated = !!data.last_donated;
        document.getElementById('donorHasLastDonated').checked = hasLastDonated;
        document.getElementById('donorLastDonated').classList.toggle('hide', !hasLastDonated);
        if (hasLastDonated) {
          document.getElementById('donorLastDonated').value = data.last_donated;
        }
        
        document.getElementById('donorId').value = donorId;
        App.elements.deleteDonorBtn.classList.remove('hide');
      }
    } else if (App.state.currentUser && !App.state.isAdmin) {
      // Regular user editing their own profile
      const { data } = await db.from('donors').select('*').eq('user_id', App.state.currentUser.id).single();
      if (data) {
        form.elements.donorName.value = data.name || '';
        form.elements.donorPhone.value = data.phone || '';
        form.elements.donorBloodGroup.value = data.blood_group || '';
        form.elements.donorLocation.value = data.location || '';
        form.elements.donorAvailable.checked = data.available;
        
        // Handle last donated
        const hasLastDonated = !!data.last_donated;
        document.getElementById('donorHasLastDonated').checked = hasLastDonated;
        document.getElementById('donorLastDonated').classList.toggle('hide', !hasLastDonated);
        if (hasLastDonated) {
          document.getElementById('donorLastDonated').value = data.last_donated;
        }
        
        document.getElementById('donorId').value = data.id;
        App.elements.deleteDonorBtn.classList.remove('hide');
      } else {
        form.elements.donorName.value = App.state.userProfile?.name || '';
      }
    }
  },

  updateMyProfileButtonText() {
    if (!App.state.isAdmin && App.state.currentUser) {
      const isBn = localStorage.getItem('lang') === 'bn';
      App.elements.myDonorBtn.textContent = isBn ? 'আমার প্রোফাইল' : 'My Profile';
    }
  },

  shuffleDonors(array) {
    // Fisher-Yates shuffle algorithm
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  async fetchAllDonors() {
    try {
      const { data, error } = await db.from('donors').select('*').order('name');
      if (!error && data) {
        localStorage.setItem('donorsData', JSON.stringify(data));
        App.state.allDonors = data;
      }
    } catch (err) {
      console.error('Error fetching donors:', err);
    }
  },

  // Check if donor is actually available (considering recent donation)
  isDonorAvailable(donor) {
    if (!donor.available) return false;
    
    if (donor.last_donated) {
      const lastDonatedDate = new Date(donor.last_donated);
      const today = new Date();
      const diffTime = today - lastDonatedDate;
      const daysSinceDonation = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (daysSinceDonation < 100) return false;
    }
    
    return true;
  },

  // Sort donors: available first, unavailable last
  sortDonorsByAvailability(donors) {
    return donors.sort((a, b) => {
      const aAvailable = this.isDonorAvailable(a);
      const bAvailable = this.isDonorAvailable(b);
      
      if (aAvailable && !bAvailable) return -1;
      if (!aAvailable && bAvailable) return 1;
      return 0;
    });
  },

  // Shuffle only the available donors, keeping unavailable ones at the end
  shuffleAvailableDonors(donors) {
    const available = [];
    const unavailable = [];
    
    // Separate available and unavailable donors
    donors.forEach(donor => {
      if (this.isDonorAvailable(donor)) {
        available.push(donor);
      } else {
        unavailable.push(donor);
      }
    });
    
    // Shuffle only the available donors
    const shuffledAvailable = this.shuffleDonors(available);
    
    // Combine: shuffled available donors + unavailable donors at the end
    return [...shuffledAvailable, ...unavailable];
  }
};