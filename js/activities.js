// Notices/Activities Functions
async function loadNotices() {
    if (App.state.isLoading.notices) return;
    App.state.isLoading.notices = true;
    App.renderLoader('notices');
    try {
        const { data, error } = await db.from('notices').select('*').order('timestamp', { ascending: false }).limit(20);
        if (error) throw error;
        localStorage.setItem('noticesData', JSON.stringify(data));
        renderNotices(data);
    } catch {
        const cached = JSON.parse(localStorage.getItem('noticesData') || '[]');
        renderNotices(cached);
    }
    App.state.isLoading.notices = false;
}

function renderNotices(notices) {
    if (notices.length === 0) {
        const isBn = localStorage.getItem('lang') === 'bn';
        const noActivitiesText = isBn ? 'কোনো কার্যক্রম নেই' : 'No activities yet';
        App.elements.noticesList.innerHTML = `<div class="text-gray-400 text-center py-8">${noActivitiesText}</div>`;
        return;
    }
    App.elements.noticesList.innerHTML = notices.map(notice => {
        const bdTime = new Date(new Date(notice.timestamp).getTime() + (6 * 60 * 60 * 1000));
        const formattedTime = bdTime.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return `
        <div class="bg-white rounded-xl shadow-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center">
              <div class="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                ${notice.author_name ? notice.author_name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <div class="font-bold text-gray-800">${notice.author_name || 'Anonymous'}</div>
                <div class="text-xs text-gray-500">${formattedTime}</div>
              </div>
            </div>
            ${App.state.isAdmin ? `
              <div class="flex gap-1">
                <button class="edit-notice-btn text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition" data-notice-id="${notice.id}">
                  <img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;">
                </button>
                <button class="bump-notice-btn text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition" data-notice-id="${notice.id}" title="Bump to top"><img src="svgs/icon-bump.svg"></button>
                <button class="delete-notice-btn text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition" data-notice-id="${notice.id}">
                  <img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;">
                </button>
              </div>
            ` : ''}
          </div>
          <p class="text-gray-700 whitespace-pre-wrap">${notice.text || ''}</p>
        </div>
      `;
    }).join('');

    if (App.state.isAdmin) {
        document.querySelectorAll('.edit-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => editNotice(btn.dataset.noticeId));
        });
        document.querySelectorAll('.bump-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => bumpNotice(btn.dataset.noticeId));
        });
        document.querySelectorAll('.delete-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteNotice(btn.dataset.noticeId));
        });
    }
}

async function editNotice(noticeId) {
    const { data, error } = await db.from('notices').select('*').eq('id', parseInt(noticeId)).single();
    if (error) return App.showNotification(error.message, true);

    document.getElementById('noticeId').value = noticeId;
    document.getElementById('noticeText').value = data.text || '';

    const modalTitle = document.querySelector('#postNoticeModal h2');
    const isBn = localStorage.getItem('lang') === 'bn';
    modalTitle.textContent = isBn ? 'কার্যক্রম এডিট করুন' : 'Edit Activity';

    const submitBtn = document.querySelector('#postNoticeForm button[type="submit"]');
    submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

    App.showModal('postNoticeModal');
}

async function bumpNotice(noticeId) {
    if (!confirm('Bump this activity to the top? (Original timestamp will be kept)')) return;

    const { data, error } = await db.from('notices').select('*').eq('id', parseInt(noticeId)).single();
    if (error) return App.showNotification(error.message, true);

    const { error: deleteError } = await db.from('notices').delete().eq('id', parseInt(noticeId));
    if (deleteError) return App.showNotification(deleteError.message, true);

    const { error: insertError } = await db.from('notices').insert({
        text: data.text,
        author_name: data.author_name,
        author_id: data.author_id,
        timestamp: data.timestamp
    });

    if (insertError) return App.showNotification(insertError.message, true);

    App.showNotification('Activity bumped to top!');
    loadNotices();
}

async function deleteNotice(noticeId) {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    const { error } = await db.from('notices').delete().eq('id', parseInt(noticeId));
    if (error) return App.showNotification(error.message, true);

    App.showNotification('Activity deleted.');
    loadNotices();
}

async function fetchAllNotices() {
    try {
        const { data, error } = await db.from('notices').select('*').order('timestamp', { ascending: false }).limit(20);
        if (!error && data) {
            localStorage.setItem('noticesData', JSON.stringify(data));
        }
    } catch (err) {
        console.error('Error fetching notices:', err);
    }
}

// Expose functions to App
window.NoticesModule = {
    loadNotices,
    renderNotices,
    editNotice,
    bumpNotice,
    deleteNotice,
    fetchAllNotices
};