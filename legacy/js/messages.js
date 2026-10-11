// Messages Module - User-Admin Communication System
// Handles messaging between users and admins with read/reply status tracking

window.MessagesModule = {
  // State
  canSendMessage: true,
  cooldownEndTime: null,

  // Update cooldown warning display
  async updateCooldownWarning() {
    const warningDiv = document.getElementById('messageCooldownWarning');
    const cooldownText = document.getElementById('cooldownText');

    if (!warningDiv || !cooldownText || !App.state.currentUser) return;

    await this.checkMessageCooldown(App.state.currentUser.id);

    if (!this.canSendMessage && this.cooldownEndTime) {
      const remaining = this.cooldownEndTime - Date.now();
      const hours = Math.floor(remaining / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

      const isBn = localStorage.getItem('lang') === 'bn';
      const timeText = isBn
        ? `আপনি ${hours} ঘন্টা ${minutes} মিনিট পরে আবার মেসেজ পাঠাতে পারবেন`
        : `You can send another message in ${hours}h ${minutes}m`;

      cooldownText.textContent = timeText;
      warningDiv.classList.remove('hide');
    } else {
      warningDiv.classList.add('hide');
    }
  },

  // Check if user can send a message (36 hour cooldown)
  async checkMessageCooldown(userId) {
    try {
      const { data, error } = await db
        .from('users')
        .select('last_message_time')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (!data || !data.last_message_time) {
        this.canSendMessage = true;
        this.cooldownEndTime = null;
        return true;
      }

      const cooldownMs = 36 * 60 * 60 * 1000; // 36 hours in milliseconds
      const lastMessageTime = new Date(data.last_message_time).getTime();
      const timeSinceLastMessage = Date.now() - lastMessageTime;

      if (timeSinceLastMessage >= cooldownMs) {
        this.canSendMessage = true;
        this.cooldownEndTime = null;
        return true;
      }

      this.canSendMessage = false;
      this.cooldownEndTime = lastMessageTime + cooldownMs;
      return false;
    } catch (err) {
      console.error('Error checking message cooldown:', err);
      // On error, allow sending (fail open)
      this.canSendMessage = true;
      this.cooldownEndTime = null;
      return true;
    }
  },

  // Format cooldown time remaining
  getCooldownTimeRemaining() {
    if (!this.cooldownEndTime) return '';

    const remaining = this.cooldownEndTime - Date.now();
    if (remaining <= 0) return '';

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return `${hours}h ${minutes}m`;
  },

  // Load user's messages
  async loadUserMessages() {
    const isBn = localStorage.getItem('lang') === 'bn';
    const messagesList = document.getElementById('userMessagesList');

    if (!messagesList) return;

    messagesList.innerHTML = '<div class="loader"></div>';

    // Update cooldown warning
    await this.updateCooldownWarning();
    // Start interval to update every minute
    if (this.cooldownInterval) clearInterval(this.cooldownInterval);
    this.cooldownInterval = setInterval(async () => {
      await this.updateCooldownWarning();
    }, 60000); // Update every minute

    try {
      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('user_id', App.state.currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        messagesList.innerHTML = `
          <div class="text-gray-400 text-center py-8">
            ${isBn ? 'কোনো মেসেজ নেই' : 'No messages yet'}
          </div>
        `;
        return;
      }

      messagesList.innerHTML = data.map(msg => {
        let bgColor = 'bg-yellow-50 border-yellow-200';
        let statusText = isBn ? 'পাঠানো হয়েছে' : 'Sent';

        if (msg.admin_reply) {
          bgColor = 'bg-sky-50 border-sky-200';
          statusText = isBn ? 'উত্তর পাওয়া গেছে' : 'Replied';
        } else if (msg.read_at) {
          bgColor = 'bg-green-50 border-green-200';
          statusText = isBn ? 'পড়া হয়েছে' : 'Read';
        }

        const timestamp = new Date(msg.created_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        return `
          <div class="border ${bgColor} rounded-lg p-4 cursor-pointer hover:shadow-md transition" data-view-message="${msg.id}">
            <div class="flex justify-between items-start mb-2">
              <div class="font-semibold text-gray-800">${msg.subject}</div>
              <span class="text-xs px-2 py-1 rounded ${msg.admin_reply ? 'bg-sky-200 text-sky-800' : msg.read_at ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}">${statusText}</span>
            </div>
            ${msg.message ? `<div class="text-sm text-gray-600 mb-2 line-clamp-2">${msg.message}</div>` : ''}
            <div class="text-xs text-gray-500">${timestamp}</div>
          </div>
        `;
      }).join('');

      // Bind view message events
      document.querySelectorAll('[data-view-message]').forEach(card => {
        card.addEventListener('click', () => {
          this.viewUserMessage(card.dataset.viewMessage);
        });
      });

    } catch (err) {
      console.error('Error loading user messages:', err);
      messagesList.innerHTML = `
        <div class="text-red-500 text-center py-4">
          ${isBn ? 'মেসেজ লোড করতে ব্যর্থ' : 'Failed to load messages'}
        </div>
      `;
    }
  },

  // View a user's own message
  async viewUserMessage(messageId) {
    const isBn = localStorage.getItem('lang') === 'bn';

    try {
      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('id', parseInt(messageId))
        .single();

      if (error) throw error;

      const timestamp = new Date(data.created_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      document.getElementById('viewMessageSubject').textContent = data.subject;
      document.getElementById('viewMessageTimestamp').textContent = timestamp;

      // Make links clickable in message content
      const messageContent = data.message || (isBn ? '(কোনো মেসেজ নেই)' : '(No message)');
      document.getElementById('viewMessageContent').innerHTML = this.linkifyText(messageContent);

      const replySection = document.getElementById('viewMessageReply');
      if (data.admin_reply) {
        const replyTime = new Date(data.replied_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        replySection.innerHTML = `
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="font-semibold text-green-700 mb-2">${isBn ? 'অ্যাডমিনের উত্তর:' : 'Admin Reply:'}</div>
            <div class="bg-green-50 p-3 rounded-lg text-gray-700">${this.linkifyText(data.admin_reply)}</div>
            <div class="text-xs text-gray-500 mt-2">${replyTime}</div>
          </div>
        `;
      } else {
        replySection.innerHTML = '';
      }

      App.showModal('viewUserMessageModal');

    } catch (err) {
      console.error('Error viewing message:', err);
      App.showNotification(isBn ? 'মেসেজ লোড করতে ব্যর্থ' : 'Failed to load message', true);
    }
  },

  // Open compose message modal
  async openComposeMessage() {
    const isBn = localStorage.getItem('lang') === 'bn';

    // Check cooldown
    await this.checkMessageCooldown(App.state.currentUser.id);

    if (!this.canSendMessage) {
      const timeRemaining = this.getCooldownTimeRemaining();
      App.showNotification(
        isBn
          ? `আপনি ${timeRemaining} পরে আবার মেসেজ পাঠাতে পারবেন`
          : `You can send another message in ${timeRemaining}`,
        true
      );
      return;
    }

    document.getElementById('composeMessageForm').reset();
    App.showModal('composeMessageModal');
  },

  // Send message to admin
  async sendMessageToAdmin(subject, message) {
    const isBn = localStorage.getItem('lang') === 'bn';

    if (!this.canSendMessage) {
      const timeRemaining = this.getCooldownTimeRemaining();
      App.showNotification(
        isBn
          ? `আপনি ${timeRemaining} পরে আবার মেসেজ পাঠাতে পারবেন`
          : `You can send another message in ${timeRemaining}`,
        true
      );
      return;
    }

    try {
      // Insert message
      const { error: messageError } = await db.from('messages').insert({
        user_id: App.state.currentUser.id,
        user_name: App.state.userProfile.name,
        subject,
        message: message || null,
        status: 'unread'
      });

      if (messageError) throw messageError;

      // Update last_message_time in users table
      const { error: userError } = await db
        .from('users')
        .update({ last_message_time: new Date().toISOString() })
        .eq('id', App.state.currentUser.id);

      if (userError) throw userError;

      // Refresh cooldown state
      await this.checkMessageCooldown(App.state.currentUser.id);

      App.showNotification(isBn ? 'মেসেজ পাঠানো হয়েছে!' : 'Message sent!');
      App.hideAllModals();
      this.loadUserMessages();

    } catch (err) {
      console.error('Error sending message:', err);
      App.showNotification(isBn ? 'মেসেজ পাঠাতে ব্যর্থ' : 'Failed to send message', true);
    }
  },

  // Load admin messages with tabs
  async loadAdminMessages(tab = 'unread') {
    const isBn = localStorage.getItem('lang') === 'bn';
    const messagesList = document.getElementById('adminMessagesList');

    if (!messagesList) return;

    messagesList.innerHTML = '<div class="loader"></div>';

    // Update tab buttons
    document.querySelectorAll('.admin-message-tab').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.classList.add('bg-blue-600', 'text-white');
        btn.classList.remove('bg-white', 'text-blue-600');
      } else {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('bg-white', 'text-blue-600');
      }
    });

    try {
      let query = db.from('messages').select('*').order('created_at', { ascending: false });

      if (tab === 'unread') {
        query = query.eq('status', 'unread');
      } else if (tab === 'read') {
        query = query.eq('status', 'read');
      } else if (tab === 'replied') {
        query = query.eq('status', 'replied');
      }

      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        messagesList.innerHTML = `
          <div class="text-gray-400 text-center py-8">
            ${isBn ? 'কোনো মেসেজ নেই' : 'No messages'}
          </div>
        `;
        return;
      }

      messagesList.innerHTML = data.map(msg => {
        let cardClass = 'bg-white';
        let textClass = 'text-gray-800';
        let fontWeight = 'font-semibold';

        if (msg.status === 'replied') {
          cardClass = 'bg-blue-50';
        } else if (msg.status === 'read') {
          textClass = 'text-gray-500';
          fontWeight = 'font-normal';
        }

        const timestamp = new Date(msg.created_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        const truncatedMessage = msg.message
          ? (msg.message.length > 100 ? msg.message.substring(0, 100) + '...' : msg.message)
          : (isBn ? '(কোনো মেসেজ নেই)' : '(No message)');

        return `
          <div class="border border-gray-200 ${cardClass} rounded-lg p-4 cursor-pointer hover:shadow-md transition" data-admin-view-message="${msg.id}">
            <div class="flex justify-between items-start mb-2">
              <div class="${fontWeight} ${textClass}">${msg.subject}</div>
            </div>
            <div class="text-sm text-gray-600 mb-2">${isBn ? 'থেকে:' : 'From:'} ${msg.user_name}</div>
            <div class="text-sm ${textClass} mb-2">${truncatedMessage}</div>
            <div class="text-xs text-gray-500">${timestamp}</div>
          </div>
        `;
      }).join('');

      // Bind view message events
      document.querySelectorAll('[data-admin-view-message]').forEach(card => {
        card.addEventListener('click', () => {
          this.viewAdminMessage(card.dataset.adminViewMessage, tab);
        });
      });

    } catch (err) {
      console.error('Error loading admin messages:', err);
      messagesList.innerHTML = `
        <div class="text-red-500 text-center py-4">
          ${isBn ? 'মেসেজ লোড করতে ব্যর্থ' : 'Failed to load messages'}
        </div>
      `;
    }

    // Update unread badge
    this.updateAdminMessageBadge();
  },

  // View message as admin
  async viewAdminMessage(messageId, currentTab) {
    const isBn = localStorage.getItem('lang') === 'bn';

    try {
      const { data, error } = await db
        .from('messages')
        .select('*')
        .eq('id', parseInt(messageId))
        .single();

      if (error) throw error;

      // Mark as read in database immediately if status is 'unread'
      if (data.status === 'unread') {
        await db
          .from('messages')
          .update({
            read_at: new Date().toISOString(),
            status: 'read'
          })
          .eq('id', parseInt(messageId));
      }

      // Store current message context for navigation
      this.currentMessageId = messageId;
      this.currentMessageTab = currentTab;

      const timestamp = new Date(data.created_at).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      document.getElementById('adminViewMessageFrom').textContent = data.user_name;
      document.getElementById('adminViewMessageSubject').textContent = data.subject;
      document.getElementById('adminViewMessageTimestamp').textContent = timestamp;

      // Make links clickable in message content
      const messageContent = data.message || (isBn ? '(কোনো মেসেজ নেই)' : '(No message)');
      document.getElementById('adminViewMessageContent').innerHTML = this.linkifyText(messageContent);

      // Show/hide reply section based on status
      const replySection = document.getElementById('adminReplySection');
      if (data.status === 'replied' || data.admin_reply) {
        const replyTime = new Date(data.replied_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        replySection.innerHTML = `
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="font-semibold text-blue-700 mb-2">${isBn ? 'আপনার উত্তর:' : 'Your Reply:'}</div>
            <div class="bg-blue-50 p-3 rounded-lg text-gray-700">${this.linkifyText(data.admin_reply)}</div>
            <div class="text-xs text-gray-500 mt-2">${replyTime}</div>
          </div>
        `;
      } else {
        replySection.innerHTML = `
          <div class="mt-4 pt-4 border-t border-gray-200">
            <label class="block font-semibold text-gray-700 mb-2">${isBn ? 'উত্তর দিন:' : 'Reply:'}</label>
            <textarea id="adminReplyInput" class="w-full p-3 border border-gray-300 rounded-lg mb-3" rows="3" placeholder="${isBn ? 'আপনার উত্তর লিখুন...' : 'Type your reply...'}"></textarea>
            <div class="flex gap-2 flex-wrap">
              <button class="quick-reply-btn bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition" data-reply="👍">👍</button>
              <button class="quick-reply-btn bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition" data-reply="${isBn ? 'অবশ্যই' : 'Sure'}">✓ ${isBn ? 'অবশ্যই' : 'Sure'}</button>
              <button class="quick-reply-btn bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 transition" data-reply="OK">✓ OK</button>
              <button id="sendAdminReplyBtn" class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition ml-auto">${isBn ? 'পাঠান' : 'Send'}</button>
            </div>
          </div>
        `;

        // Bind quick reply buttons
        document.querySelectorAll('.quick-reply-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.sendQuickReply(messageId, btn.dataset.reply);
          });
        });

        // Bind send reply button
        document.getElementById('sendAdminReplyBtn').addEventListener('click', () => {
          const reply = document.getElementById('adminReplyInput').value.trim();
          if (reply) {
            this.sendAdminReply(messageId, reply);
          } else {
            App.showNotification(isBn ? 'দয়া করে একটি উত্তর লিখুন' : 'Please type a reply', true);
          }
        });
      }

      App.showModal('adminViewMessageModal');

    } catch (err) {
      console.error('Error viewing message:', err);
      App.showNotification(isBn ? 'মেসেজ লোড করতে ব্যর্থ' : 'Failed to load message', true);
    }
  },

  // Send quick reply
  async sendQuickReply(messageId, reply) {
    await this.sendAdminReply(messageId, reply);
  },

  // Send admin reply
  async sendAdminReply(messageId, reply) {
    const isBn = localStorage.getItem('lang') === 'bn';

    try {
      const { error } = await db
        .from('messages')
        .update({
          admin_reply: reply,
          replied_at: new Date().toISOString(),
          status: 'replied'
        })
        .eq('id', parseInt(messageId));

      if (error) throw error;

      App.showNotification(isBn ? 'উত্তর পাঠানো হয়েছে!' : 'Reply sent!');
      App.hideAllModals();

      // Reload messages in current tab
      const currentTab = this.currentMessageTab || 'unread';
      this.loadAdminMessages(currentTab);

    } catch (err) {
      console.error('Error sending reply:', err);
      App.showNotification(isBn ? 'উত্তর পাঠাতে ব্যর্থ' : 'Failed to send reply', true);
    }
  },

  // Update message status on modal close (no longer needed - handled in viewAdminMessage)
  async updateMessageStatusOnClose() {
    // Status is now updated immediately when message is viewed
    // Clean up context variables
    this.currentMessageId = null;
    this.currentMessageTab = null;
  },

  // Update badge for user (show red dot if there's a reply)
  async updateUserMessageBadge() {
    try {
      const { data, error } = await db
        .from('messages')
        .select('id')
        .eq('user_id', App.state.currentUser.id)
        .not('admin_reply', 'is', null)
        .is('user_read_reply', null);

      if (error) throw error;

      const hasUnread = data && data.length > 0;

      const userBadge = document.getElementById('messageAdminBadge');
      if (userBadge) {
        userBadge.classList.toggle('hide', !hasUnread);
      }

      const talibBadge = document.getElementById('talibMessageAdminBadge');
      if (talibBadge) {
        talibBadge.classList.toggle('hide', !hasUnread);
      }

    } catch (err) {
      console.error('Error checking user message badge:', err);
    }
  },

  // Update badge for admin (show red dot if there are unread messages)
  async updateAdminMessageBadge() {
    try {
      const { data, error } = await db
        .from('messages')
        .select('id')
        .eq('status', 'unread');

      if (error) throw error;

      const badge = document.getElementById('userMessagesBadge');
      if (badge) {
        badge.classList.toggle('hide', !data || data.length === 0);
      }

    } catch (err) {
      console.error('Error checking admin message badge:', err);
    }
  },

  // Mark user's view of admin reply
  async markUserReplyAsRead(messageId) {
    try {
      await db
        .from('messages')
        .update({ user_read_reply: new Date().toISOString() })
        .eq('id', parseInt(messageId));

      this.updateUserMessageBadge();
    } catch (err) {
      console.error('Error marking reply as read:', err);
    }
  },

  // Convert URLs in text to clickable links
  linkifyText(text) {
    if (!text) return text;

    // URL regex pattern
    const urlPattern = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;

    // Replace URLs with anchor tags
    return text.replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>');
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  // Check message cooldown on init
  if (App.state.currentUser) {
    await window.MessagesModule.checkMessageCooldown(App.state.currentUser.id);
  }
});