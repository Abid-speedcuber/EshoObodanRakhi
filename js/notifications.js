// notifications.js - Notifications Management Module
window.NotificationsModule = {
  canManageNotifications() {
    const role = App.state.userProfile?.role;
    return role === 'admin' || role === 'moderator';
  },

  async loadNotifications() {
    if (App.state.isLoading.notifications) return;
    App.state.isLoading.notifications = true;

    try {
      const userRole = App.state.userProfile?.role;
      let query = db.from('notifications').select('*');

      // Filter based on user role
      if (userRole === 'student') {
        query = query.in('target_audience', ['all', 'student']);
      } else if (userRole === 'admin' || userRole === 'moderator') {
        // Admins and moderators see all notifications
      } else {
        // Regular users see only 'all' targeted notifications
        query = query.eq('target_audience', 'all');
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      this.renderNotifications(data || []);
      this.updateNotificationBadge(data || []);
    } catch (err) {
      console.error('Error loading notifications:', err);
      App.showNotification('Failed to load notifications', true);
    }

    App.state.isLoading.notifications = false;
  },

  makeLinksClickable(text) {
    // Convert URLs to clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline break-all">$1</a>');
  },

  renderNotifications(notifications) {
    const list = document.getElementById('notificationsList');
    const canManage = this.canManageNotifications();

    if (notifications.length === 0) {
      const isBn = localStorage.getItem('lang') === 'bn';
      list.innerHTML = `<div class="text-gray-400 text-center py-8">${isBn ? 'কোনো নোটিফিকেশন নেই' : 'No notifications'}</div>`;
      return;
    }

    list.innerHTML = notifications.map(notif => {
      const date = new Date(notif.created_at);
      const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const targetBadge = notif.target_audience === 'student'
        ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded ml-2">Students</span>'
        : '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded ml-2">All Users</span>';

      // Process content: convert line breaks and make links clickable
      const processedContent = this.makeLinksClickable(notif.content.replace(/\n/g, '<br>'));

      return `
        <div class="bg-white rounded-xl shadow-lg p-4 border-l-4 border-purple-400">
          <div class="flex justify-between items-start gap-3 mb-2">
            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-gray-800 break-words">${notif.title}${targetBadge}</h3>
              <p class="text-sm text-gray-600 mt-1 break-words whitespace-pre-wrap">${processedContent}</p>
              <p class="text-xs text-gray-400 mt-2">${formattedDate}</p>
            </div>
            ${canManage ? `
              <div class="flex flex-col gap-1 flex-shrink-0">
                <button class="edit-notification-btn text-xs bg-blue-100 text-blue-700 p-1.5 rounded hover:bg-blue-200 transition" data-notification-id="${notif.id}" title="Edit">
                  <img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;">
                </button>
                <button class="bump-notification-btn text-xs bg-green-100 text-green-700 p-1.5 rounded hover:bg-green-200 transition" data-notification-id="${notif.id}" title="Bump to top">
                  <img src="svgs/icon-bump.svg" style="width: 16px; height: 16px;">
                </button>
                <button class="delete-notification-btn text-xs bg-red-100 text-red-700 p-1.5 rounded hover:bg-red-200 transition" data-notification-id="${notif.id}" title="Delete">
                  <img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;">
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Bind event listeners
    if (canManage) {
      list.querySelectorAll('.edit-notification-btn').forEach(btn => {
        btn.addEventListener('click', () => this.editNotification(btn.dataset.notificationId));
      });
      list.querySelectorAll('.bump-notification-btn').forEach(btn => {
        btn.addEventListener('click', () => this.bumpNotification(btn.dataset.notificationId));
      });
      list.querySelectorAll('.delete-notification-btn').forEach(btn => {
        btn.addEventListener('click', () => this.deleteNotification(btn.dataset.notificationId));
      });
    }
  },

  updateNotificationBadge(notifications) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;

    // Only show badge for regular users (not students, admins, moderators)
    const isRegularUser = App.state.userProfile?.role === 'user';
    if (!isRegularUser) {
      badge.classList.add('hide');
      return;
    }

    const unreadCount = notifications.length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('hide');
    } else {
      badge.classList.add('hide');
    }
  },

  async editNotification(notificationId) {
    const { data, error } = await db.from('notifications').select('*').eq('id', parseInt(notificationId)).single();
    if (error) return App.showNotification(error.message, true);

    document.getElementById('notificationId').value = notificationId;
    document.getElementById('notificationTitle').value = data.title || '';
    document.getElementById('notificationContent').value = data.content || '';
    document.getElementById('notificationTarget').value = data.target_audience || '';
    document.getElementById('notificationModalTitle').textContent = 'Edit Notification';

    App.showModal('notificationModal');
  },

  async bumpNotification(notificationId) {
    if (!confirm('Bump this notification to the top?')) return;

    const { data, error } = await db.from('notifications').select('*').eq('id', parseInt(notificationId)).single();
    if (error) return App.showNotification(error.message, true);

    const { error: deleteError } = await db.from('notifications').delete().eq('id', parseInt(notificationId));
    if (deleteError) return App.showNotification(deleteError.message, true);

    const { error: insertError } = await db.from('notifications').insert({
      title: data.title,
      content: data.content,
      target_audience: data.target_audience,
      created_by: data.created_by
    });

    if (insertError) return App.showNotification(insertError.message, true);

    App.showNotification('Notification bumped to top!');
    this.loadNotifications();
  },

  async deleteNotification(notificationId) {
    if (!confirm('Are you sure you want to delete this notification?')) return;

    const { error } = await db.from('notifications').delete().eq('id', parseInt(notificationId));
    if (error) return App.showNotification(error.message, true);

    App.showNotification('Notification deleted.');
    this.loadNotifications();
  }
};