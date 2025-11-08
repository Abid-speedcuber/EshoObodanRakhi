// Simple Notes with Live Formatting Preview

function canAccessNotes() {
    return App.state.currentUser !== null;
}

function canBackupNotesToCloud() {
    const role = App.state.userProfile?.role;
    return role === 'admin' || role === 'student' || role === 'moderator';
}

function loadNotesFromLocalStorage() {
    try {
        const userId = App.state.userProfile?.id || 'guest';
        const notesKey = `notes_${userId}`;
        const cachedNotes = localStorage.getItem(notesKey);
        if (cachedNotes) {
            App.state.notes = JSON.parse(cachedNotes);
        }

        const deletedIdsKey = `notes_deletedIds_${userId}`;
        const deletedIds = localStorage.getItem(deletedIdsKey);
        App.state.notesDeletedIds = deletedIds ? JSON.parse(deletedIds) : [];

        const recycleBin2Key = `notes_recycleBin2_${userId}`;
        const recycleBin2 = localStorage.getItem(recycleBin2Key);
        App.state.notesRecycleBin2 = recycleBin2 ? JSON.parse(recycleBin2) : [];
    } catch (err) {
        console.error('Error loading notes from localStorage:', err);
        App.state.notes = [];
        App.state.notesDeletedIds = [];
        App.state.notesRecycleBin2 = [];
    }
}

function saveNotesToLocalStorage() {
    try {
        const userId = App.state.userProfile?.id || 'guest';
        const notesKey = `notes_${userId}`;
        localStorage.setItem(notesKey, JSON.stringify(App.state.notes));

        const deletedIdsKey = `notes_deletedIds_${userId}`;
        localStorage.setItem(deletedIdsKey, JSON.stringify(App.state.notesDeletedIds || []));

        const recycleBin2Key = `notes_recycleBin2_${userId}`;
        localStorage.setItem(recycleBin2Key, JSON.stringify(App.state.notesRecycleBin2 || []));
    } catch (err) {
        console.error('Error saving notes to localStorage:', err);
    }
}

async function syncNotesFromServer() {
    if (!App.state.currentUser) return;

    try {
        const { data, error } = await db.from('notes').select('*').eq('user_id', App.state.currentUser.id);

        if (error) throw error;

        const serverNotes = data || [];
        const localNotes = App.state.notes;
        const deletedIds = new Set(App.state.notesDeletedIds || []);

        // Create maps for easier lookup
        const localNotesMap = new Map();
        localNotes.forEach(note => {
            localNotesMap.set(note.id, note);
        });

        const mergedNotes = [];
        const processedIds = new Set();

        // First, keep all local notes (they have priority)
        localNotes.forEach(note => {
            mergedNotes.push(note);
            processedIds.add(note.id);
        });

        // Then, add server notes that:
        // 1. Don't exist locally (new notes from other devices)
        // 2. Are not in the deleted IDs list
        serverNotes.forEach(serverNote => {
            const noteId = serverNote.id;
            
            if (!processedIds.has(noteId) && !deletedIds.has(noteId)) {
                mergedNotes.push({
                    id: noteId,
                    title: serverNote.title,
                    content: serverNote.content,
                    datestamp: serverNote.datestamp,
                    createdAt: serverNote.created_at,
                    updatedAt: serverNote.updated_at
                });
                processedIds.add(noteId);
            }
        });

        App.state.notes = mergedNotes;
        saveNotesToLocalStorage();

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());

        console.log(`Synced: ${localNotes.length} local + ${serverNotes.length} server = ${mergedNotes.length} total (${deletedIds.size} filtered)`);

    } catch (err) {
        console.error('Error syncing notes from server:', err);
    }
}

function exportNotesToFile() {
    if (!canAccessNotes()) {
        return App.showNotification('You need access to notes feature', true);
    }

    if (App.state.notes.length === 0) {
        return App.showNotification('No notes to export', true);
    }

    const dataStr = JSON.stringify(App.state.notes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    link.download = `notes_backup_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    App.showNotification('Notes exported successfully!');
}

async function importNotesFromFile(event) {
    if (!canAccessNotes()) {
        return App.showNotification('You need access to notes feature', true);
    }

    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json') {
        return App.showNotification('Please select a valid JSON file', true);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedNotes = JSON.parse(e.target.result);

            if (!Array.isArray(importedNotes)) {
                throw new Error('Invalid notes format');
            }

            const validNotes = importedNotes.filter(note => {
                return note.id && note.content && note.datestamp;
            });

            if (validNotes.length === 0) {
                throw new Error('No valid notes found in file');
            }

            const replace = confirm(
                `Found ${validNotes.length} valid notes.\n\n` +
                `Replace existing notes? (OK = Replace, Cancel = Merge with existing)`
            );

            if (replace) {
                App.state.notes = validNotes;
            } else {
                const existingIds = new Set(App.state.notes.map(n => n.id));
                const newNotes = validNotes.filter(n => !existingIds.has(n.id));
                App.state.notes = [...App.state.notes, ...newNotes];
            }

            saveNotesToLocalStorage();
            renderNotes();
            App.showNotification(`Successfully imported ${validNotes.length} notes!`);

            event.target.value = '';
        } catch (err) {
            console.error('Error importing notes:', err);
            App.showNotification('Failed to import notes: Invalid file format', true);
        }
    };

    reader.onerror = () => {
        App.showNotification('Failed to read file', true);
    };

    reader.readAsText(file);
}

async function backupNotesToServer() {
    if (!App.state.currentUser || !canAccessNotes()) {
        return App.showNotification('You must be logged in to backup notes', true);
    }

    if (!canBackupNotesToCloud()) {
        return App.showModal('notesAccessDeniedModal');
    }

    App.showNotification('Backing up notes to cloud...');

    try {
        // Delete all existing notes for this user on server
        const { error: deleteError } = await db.from('notes').delete().eq('user_id', App.state.currentUser.id);

        if (deleteError) throw deleteError;

        // Upload current local notes to server
        if (App.state.notes.length > 0) {
            const notesToInsert = App.state.notes.map(note => ({
                id: note.id, // IMPORTANT: Keep the same ID
                user_id: App.state.currentUser.id,
                title: note.title || null,
                content: note.content,
                datestamp: note.datestamp,
                created_at: note.createdAt || new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));

            const { error: insertError } = await db.from('notes').insert(notesToInsert);

            if (insertError) throw insertError;
        }

        // Keep deleted IDs list and recycle bin intact
        saveNotesToLocalStorage();

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());

        App.showNotification(`Successfully backed up ${App.state.notes.length} note(s) to cloud!`);
        updateUnsyncedCount();
        
    } catch (err) {
        console.error('Error backing up notes:', err);
        App.showNotification('Failed to backup notes: ' + err.message, true);
    }
}

function updateUnsyncedCount() {
    const unsyncedElement = document.getElementById('notesUnsyncedCount');
    if (!unsyncedElement) return;

    if (!App.state.currentUser) {
        unsyncedElement.textContent = '';
        return;
    }

    const count = App.state.notes.length;

    if (count === 0) {
        unsyncedElement.textContent = '';
    } else if (count === 1) {
        unsyncedElement.textContent = 'You have 1 note you haven\'t backed up';
        unsyncedElement.style.display = 'block';
    } else {
        unsyncedElement.textContent = `You have ${count} notes you haven't backed up`;
        unsyncedElement.style.display = 'block';
    }
}

function loadNotes() {
    if (App.state.isLoading.notes) return;
    App.state.isLoading.notes = true;

    loadNotesFromLocalStorage();

    // Show edit mode button only if user has access
    const editModeBtn = document.getElementById('notesEditModeBtn');
    if (editModeBtn) {
        editModeBtn.classList.toggle('hide', !canAccessNotes());
    }

    renderNotes();
    updateUnsyncedCount();

    App.state.isLoading.notes = false;
}

function renderNotes() {
    const notesList = App.elements.notesList;
    const isEditMode = App.state.notesEditMode || false;

    if (!canAccessNotes()) {
        notesList.innerHTML = '<div class="text-gray-400 text-center py-8">You need to be a student, moderator, or admin to access notes.</div>';
        return;
    }

    if (App.state.notes.length === 0) {
        const isBn = localStorage.getItem('lang') === 'bn';
        notesList.innerHTML = `<div class="text-gray-400 text-center py-8">${isBn ? 'কোনো নোট নেই' : 'No notes yet. Click "New Note" to create one!'}</div>`;
        return;
    }

    const groupedNotes = {};
    App.state.notes.forEach(note => {
        const datestamp = note.datestamp;
        if (!groupedNotes[datestamp]) {
            groupedNotes[datestamp] = [];
        }
        groupedNotes[datestamp].push(note);
    });

    const sortedDatestamps = Object.keys(groupedNotes).sort((a, b) => new Date(b) - new Date(a));

    let html = '';

    sortedDatestamps.forEach(datestamp => {
        const notes = groupedNotes[datestamp];
        const date = new Date(datestamp);
        const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        if (notes.length === 1) {
            const note = notes[0];
            const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
            const preview = stripFormatting(note.content.substring(0, 100)) + (note.content.length > 100 ? '...' : '');

            html += `
          <div class="bg-white rounded-xl shadow-lg p-4 ${isEditMode ? 'note-selectable flex items-center' : 'cursor-pointer hover:shadow-xl'} transition" data-note-id="${note.id}">
            ${isEditMode ? '<input type="checkbox" class="note-checkbox" data-note-id="' + note.id + '">' : ''}
            <div class="flex-1">
            <div class="flex justify-between items-start mb-2">
              <h3 class="font-bold text-gray-800">${title}</h3>
              <span class="text-xs text-gray-500">${formattedDate}</span>
            </div>
            <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
          </div>
          </div>
        `;
        } else {
            html += `
          <div class="bg-blue-50 rounded-xl shadow-lg p-4 border-l-4 border-blue-400">
            <div class="flex justify-between items-center mb-3">
              ${isEditMode ? '<input type="checkbox" class="note-checkbox group-checkbox" data-date="' + datestamp + '">' : ''}
              <h3 class="font-bold text-gray-800">📅 ${formattedDate}</h3>
              <span class="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">${notes.length} notes</span>
            </div>
            <div class="space-y-2">
              ${notes.map(note => {
                const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
                return `
                  <div class="bg-white rounded-lg p-3 ${isEditMode ? 'note-selectable flex items-center' : 'cursor-pointer hover:shadow-md'} transition" data-note-id="${note.id}">
                    ${isEditMode ? '<input type="checkbox" class="note-checkbox" data-note-id="' + note.id + '">' : ''}
                    <p class="text-sm font-semibold text-gray-700 flex-1">${title}</p>
                  </div>
                `;
            }).join('')}
            </div>
          </div>
        `;
        }
    });

    notesList.innerHTML = html;

    notesList.querySelectorAll('[data-note-id]').forEach(el => {
        if (!isEditMode) {
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('note-checkbox')) {
                    const noteId = el.dataset.noteId;
                    viewNote(noteId);
                }
            });
        } else {
            // In edit mode, clicking selects the note
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('note-checkbox')) {
                    const checkbox = el.querySelector('.note-checkbox');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        el.classList.toggle('note-selected', checkbox.checked);
                    }
                }
            });
        }
    });

    // Handle checkbox changes
    if (isEditMode) {
        notesList.querySelectorAll('.note-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const noteEl = e.target.closest('[data-note-id]');
                if (noteEl) {
                    noteEl.classList.toggle('note-selected', e.target.checked);
                }
            });
        });

        // Handle group checkboxes
        notesList.querySelectorAll('.group-checkbox').forEach(groupCheckbox => {
            groupCheckbox.addEventListener('change', (e) => {
                const date = e.target.dataset.date;
                const container = e.target.closest('.bg-blue-50');
                const noteCheckboxes = container.querySelectorAll('.note-checkbox:not(.group-checkbox)');
                noteCheckboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                    const noteEl = cb.closest('[data-note-id]');
                    if (noteEl) {
                        noteEl.classList.toggle('note-selected', e.target.checked);
                    }
                });
            });
        });
    }
}

function renderRecycleBin() {
    const recycleBinList = document.getElementById('notesRecycleBinList');
    const recycleBin2 = App.state.notesRecycleBin2 || [];

    if (recycleBin2.length === 0) {
        recycleBinList.innerHTML = '<div class="text-gray-400 text-center py-8">Recycle bin is empty</div>';
        return;
    }

    const sortedNotes = [...recycleBin2].sort((a, b) => {
        return new Date(b.deletedAt) - new Date(a.deletedAt);
    });

    let html = sortedNotes.map(note => {
        const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
        const deletedDate = new Date(note.deletedAt).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="bg-gray-50 rounded-xl shadow-lg p-4 note-selectable flex items-center transition" data-note-id="${note.id}">
                <input type="checkbox" class="note-checkbox" data-note-id="${note.id}">
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-2">
                        <h3 class="font-bold text-gray-800">${title}</h3>
                        <span class="text-xs text-gray-500">Deleted: ${deletedDate}</span>
                    </div>
                    <p class="text-sm text-gray-600 line-clamp-2">${stripFormatting(note.content.substring(0, 100))}${note.content.length > 100 ? '...' : ''}</p>
                </div>
            </div>
        `;
    }).join('');

    recycleBinList.innerHTML = html;

    // Handle clicks and checkboxes
    recycleBinList.querySelectorAll('[data-note-id]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.classList.contains('note-checkbox')) {
                const checkbox = el.querySelector('.note-checkbox');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    el.classList.toggle('note-selected', checkbox.checked);
                }
            }
        });
    });

    recycleBinList.querySelectorAll('.note-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const noteEl = e.target.closest('[data-note-id]');
            if (noteEl) {
                noteEl.classList.toggle('note-selected', e.target.checked);
            }
        });
    });
}

function enterEditMode(startInRecycleBin = false) {
    App.state.notesEditMode = true;

    // Show tabs and edit buttons, hide normal buttons
    document.getElementById('notesEditModeTabs').classList.remove('hide');
    document.getElementById('notesNormalButtons').classList.add('hide');
    document.getElementById('notesEditButtons').classList.remove('hide');
    document.getElementById('notesAddButtonContainer').classList.add('hide');
    document.getElementById('notesBackBtn').classList.add('hide');

    // Update tab counts
    document.getElementById('notesTabYourNotesCount').textContent = App.state.notes.length;
    document.getElementById('notesTabRecycleBinCount').textContent = (App.state.notesRecycleBin2 || []).length;

    if (startInRecycleBin) {
        switchToRecycleBinTab();
    } else {
        switchToYourNotesTab();
    }
}

function exitEditMode() {
    App.state.notesEditMode = false;

    // Hide tabs and edit buttons, show normal buttons
    document.getElementById('notesEditModeTabs').classList.add('hide');
    document.getElementById('notesEditButtons').classList.add('hide');
    document.getElementById('notesNormalButtons').classList.remove('hide');
    document.getElementById('notesAddButtonContainer').classList.remove('hide');
    document.getElementById('notesBackBtn').classList.remove('hide');

    // Show your notes list
    document.getElementById('notesList').classList.remove('hide');
    document.getElementById('notesRecycleBinList').classList.add('hide');

    renderNotes();
}

function switchToYourNotesTab() {
    // Update tab styles
    document.getElementById('notesTabYourNotes').classList.add('bg-blue-600', 'text-white');
    document.getElementById('notesTabYourNotes').classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');

    document.getElementById('notesTabRecycleBin').classList.remove('bg-blue-600', 'text-white');
    document.getElementById('notesTabRecycleBin').classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');

    // Show your notes, hide recycle bin
    document.getElementById('notesList').classList.remove('hide');
    document.getElementById('notesRecycleBinList').classList.add('hide');

    // Update action buttons
    const actionButtonsContainer = document.getElementById('notesEditActions');
    if (actionButtonsContainer) {
        actionButtonsContainer.innerHTML = `
            <button id="deleteMultipleBtn" class="bg-gray-100 text-white p-2 rounded-lg hover:bg-gray-200 transition" title="Delete Selected">
                <img src="svgs/icon-delete.svg">
            </button>
        `;

        document.getElementById('deleteMultipleBtn')?.addEventListener('click', () => {
            window.NotesModule.deleteSelectedNotes();
        });
    }

    renderNotes();
}

function switchToRecycleBinTab() {
    // Update tab styles
    document.getElementById('notesTabRecycleBin').classList.add('bg-blue-600', 'text-white');
    document.getElementById('notesTabRecycleBin').classList.remove('bg-white', 'text-gray-700', 'border', 'border-gray-300');

    document.getElementById('notesTabYourNotes').classList.remove('bg-blue-600', 'text-white');
    document.getElementById('notesTabYourNotes').classList.add('bg-white', 'text-gray-700', 'border', 'border-gray-300');

    // Hide your notes, show recycle bin
    document.getElementById('notesList').classList.add('hide');
    document.getElementById('notesRecycleBinList').classList.remove('hide');

    // Update action buttons
    const actionButtonsContainer = document.getElementById('notesEditActions');
    if (actionButtonsContainer) {
        actionButtonsContainer.innerHTML = `
            <button id="reviveBtn" class="bg-gray-100 text-white p-2 rounded-lg hover:bg-gray-200 transition" title="Restore Selected">
                <img src="svgs/icon-restore.svg" style="transform: scale(2.1);">
            </button>
            <button id="deletePermanentlyBtn" class="bg-gray-100 text-white p-2 rounded-lg hover:bg-gray-200 transition" title="Delete Permanently">
                <img src="svgs/icon-delete.svg">
            </button>
        `;

        document.getElementById('reviveBtn')?.addEventListener('click', () => {
            window.NotesModule.reviveSelectedNotes();
        });

        document.getElementById('deletePermanentlyBtn')?.addEventListener('click', () => {
            window.NotesModule.deleteFromRecycleBin();
        });
    }

    renderRecycleBin();
}

function getSelectedNotes(fromRecycleBin = false) {
    const container = fromRecycleBin ? document.getElementById('notesRecycleBinList') : document.getElementById('notesList');
    const selectedCheckboxes = container.querySelectorAll('.note-checkbox:checked');
    return Array.from(selectedCheckboxes).map(cb => cb.dataset.noteId);
}

function deleteSelectedNotes() {
    const selectedIds = getSelectedNotes(false);

    if (selectedIds.length === 0) {
        return App.showNotification('Please select notes to delete', true);
    }

    if (!confirm(`Are you sure you want to delete ${selectedIds.length} note(s)?`)) {
        return;
    }

    // Initialize arrays if needed
    if (!App.state.notesDeletedIds) {
        App.state.notesDeletedIds = [];
    }
    if (!App.state.notesRecycleBin2) {
        App.state.notesRecycleBin2 = [];
    }

    selectedIds.forEach(noteId => {
        const noteIndex = App.state.notes.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            const deletedNote = App.state.notes[noteIndex];
            
            // Track deleted ID
            if (!App.state.notesDeletedIds.includes(noteId)) {
                App.state.notesDeletedIds.push(noteId);
            }
            
            // Move to recycle bin
            App.state.notesRecycleBin2.push({
                ...deletedNote,
                deletedAt: new Date().toISOString()
            });
            
            App.state.notes.splice(noteIndex, 1);
        }
    });

    saveNotesToLocalStorage();
    updateUnsyncedCount();

    // Update tab count
    document.getElementById('notesTabYourNotesCount').textContent = App.state.notes.length;
    document.getElementById('notesTabRecycleBinCount').textContent = App.state.notesRecycleBin2.length;

    renderNotes();
    App.showNotification(`Deleted ${selectedIds.length} note(s)`);
}

function deleteFromRecycleBin() {
    const selectedIds = getSelectedNotes(true);

    if (selectedIds.length === 0) {
        return App.showNotification('Please select notes to delete permanently', true);
    }

    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} note(s)? This cannot be undone.`)) {
        return;
    }

    selectedIds.forEach(noteId => {
        const noteIndex = App.state.notesRecycleBin2.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            App.state.notesRecycleBin2.splice(noteIndex, 1);
        }
        // Keep the ID in deletedIds list to prevent re-sync permanently
    });

    saveNotesToLocalStorage();

    // Update tab count
    document.getElementById('notesTabRecycleBinCount').textContent = App.state.notesRecycleBin2.length;

    renderRecycleBin();
    App.showNotification(`Permanently deleted ${selectedIds.length} note(s)`);
}

function reviveSelectedNotes() {
    const selectedIds = getSelectedNotes(true);

    if (selectedIds.length === 0) {
        return App.showNotification('Please select notes to revive', true);
    }

    selectedIds.forEach(noteId => {
        const noteIndex = App.state.notesRecycleBin2.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            const revivedNote = { ...App.state.notesRecycleBin2[noteIndex] };
            delete revivedNote.deletedAt;
            
            // Add back to active notes
            App.state.notes.push(revivedNote);
            
            // Remove from recycle bin
            App.state.notesRecycleBin2.splice(noteIndex, 1);
            
            // Remove from deleted IDs list (allow re-sync)
            if (App.state.notesDeletedIds) {
                const deletedIndex = App.state.notesDeletedIds.indexOf(noteId);
                if (deletedIndex !== -1) {
                    App.state.notesDeletedIds.splice(deletedIndex, 1);
                }
            }
        }
    });

    saveNotesToLocalStorage();
    updateUnsyncedCount();

    // Update tab counts
    document.getElementById('notesTabYourNotesCount').textContent = App.state.notes.length;
    document.getElementById('notesTabRecycleBinCount').textContent = App.state.notesRecycleBin2.length;

    renderRecycleBin();
    App.showNotification(`Revived ${selectedIds.length} note(s)`);
}

function stripFormatting(text) {
    if (!text) return '';
    return text
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/\+([^+]+)\+/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/%([^%]+)%/g, '$1')
        .replace(/#\((num|bul)[^)]*\)\n/g, '')
        .replace(/\n#/g, '');
}

function parseFormattingForDisplay(text) {
    if (!text) return '';

    let html = text;

    // Parse inline formatting (WITHOUT showing markers)
    html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    html = html.replace(/\+([^+]+)\+/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<span style="text-decoration: underline;">$1</span>');
    html = html.replace(/%([^%]+)%/g, '<span style="color: #dc2626;">$1</span>');

    // Parse numbered lists
    html = html.replace(/#\((num)([^)]*)\)\n([\s\S]*?)\n#/g, (match, type, params, content) => {
        const lines = content.trim().split('\n');
        let listType = 'decimal';
        let startNum = 1;

        const paramMatch = params.match(/t=([a-zA-Z0-9]+)/);
        if (paramMatch) {
            const t = paramMatch[1];
            if (t === 'a') listType = 'lower-alpha';
            else if (t === 'i') listType = 'lower-roman';
            else if (t === 'I') listType = 'upper-roman';
            else if (t === 'bn') listType = 'bengali';
        }

        const startMatch = params.match(/s=(\d+)/);
        if (startMatch) {
            startNum = parseInt(startMatch[1]);
        }

        const items = lines.map(line => `<li>${line}</li>`).join('');
        return `<ol style="list-style-type: ${listType}; margin-left: 20px; padding-left: 20px;" start="${startNum}">${items}</ol>`;
    });

    // Parse bullet lists
    html = html.replace(/#\((bul)([^)]*)\)\n([\s\S]*?)\n#/g, (match, type, params, content) => {
        const lines = content.trim().split('\n');
        let bulletStyle = 'disc';

        const paramMatch = params.match(/t=([a-z]+)/);
        if (paramMatch) {
            const t = paramMatch[1];
            if (t === 'sq') bulletStyle = 'square';
            else if (t === 'ci') bulletStyle = 'circle';
        }

        const items = lines.map(line => {
            if (paramMatch && paramMatch[1] === 'ar') {
                return `<li style="list-style: none;">→ ${line}</li>`;
            }
            return `<li>${line}</li>`;
        }).join('');
        return `<ul style="list-style-type: ${bulletStyle}; margin-left: 20px; padding-left: 20px;">${items}</ul>`;
    });

    html = html.replace(/\n/g, '<br>');

    return html;
}

function parseFormattingForEditor(text) {
    if (!text) return '';

    let html = '';
    let i = 0;

    while (i < text.length) {
        // Check for bold *text*
        if (text[i] === '*' && text.indexOf('*', i + 1) !== -1) {
            const endIndex = text.indexOf('*', i + 1);
            const innerText = text.substring(i + 1, endIndex);
            html += `<span class="format-marker">*</span><span class="format-bold">${escapeHtml(innerText)}</span><span class="format-marker">*</span>`;
            i = endIndex + 1;
            continue;
        }

        // Check for italic +text+
        if (text[i] === '+' && text.indexOf('+', i + 1) !== -1) {
            const endIndex = text.indexOf('+', i + 1);
            const innerText = text.substring(i + 1, endIndex);
            html += `<span class="format-marker">+</span><span class="format-italic">${escapeHtml(innerText)}</span><span class="format-marker">+</span>`;
            i = endIndex + 1;
            continue;
        }

        // Check for underline _text_
        if (text[i] === '_' && text.indexOf('_', i + 1) !== -1) {
            const endIndex = text.indexOf('_', i + 1);
            const innerText = text.substring(i + 1, endIndex);
            html += `<span class="format-marker">_</span><span class="format-underline">${escapeHtml(innerText)}</span><span class="format-marker">_</span>`;
            i = endIndex + 1;
            continue;
        }

        // Check for red %text%
        if (text[i] === '%' && text.indexOf('%', i + 1) !== -1) {
            const endIndex = text.indexOf('%', i + 1);
            const innerText = text.substring(i + 1, endIndex);
            html += `<span class="format-marker">%</span><span class="format-red">${escapeHtml(innerText)}</span><span class="format-marker">%</span>`;
            i = endIndex + 1;
            continue;
        }

        // Check for list markers
        if (text.substring(i).match(/^#\((num|bul)[^)]*\)/)) {
            const match = text.substring(i).match(/^#\((num|bul)[^)]*\)/);
            html += `<span class="format-marker">${escapeHtml(match[0])}</span>`;
            i += match[0].length;
            continue;
        }

        // Check for closing #
        if (text[i] === '#' && (i === 0 || text[i - 1] === '\n') && (i === text.length - 1 || text[i + 1] === '\n' || text[i + 1] === '\r')) {
            html += `<span class="format-marker">#</span>`;
            i++;
            continue;
        }

        // Regular character
        if (text[i] === '\n') {
            html += '<br>';
        } else if (text[i] === ' ') {
            html += '&nbsp;';
        } else {
            html += escapeHtml(text[i]);
        }
        i++;
    }

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getPlainTextFromEditor(editor) {
    // Use innerText which respects line breaks better
    let text = editor.innerText || '';

    // Fallback to manual parsing if innerText is not available
    if (!text) {
        text = editor.textContent || '';
    }

    // Replace non-breaking spaces with regular spaces
    text = text.replace(/\u00A0/g, ' ');

    // Normalize line breaks
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/\r/g, '\n');

    return text;
}

function viewNote(noteId) {
    const note = App.state.notes.find(n => n.id === noteId);
    if (!note) return;

    App.state.currentNote = note;

    document.getElementById('noteViewTitle').textContent = stripFormatting(note.title || 'Untitled');
    const date = new Date(note.datestamp);
    document.getElementById('noteViewDate').textContent = date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const contentEl = document.getElementById('noteViewContent');
    contentEl.innerHTML = parseFormattingForDisplay(note.content);

    App.showModal('noteViewModal');
}

function editNote(noteId = null) {
    let note = null;

    if (noteId) {
        note = App.state.notes.find(n => n.id === noteId);
        if (!note) return;
    }

    App.state.currentNote = note;

    if (note) {
        document.getElementById('noteEditId').value = note.id;
        document.getElementById('noteTitleInput').value = note.title || '';
        document.getElementById('noteDateInput').value = note.datestamp;
        document.getElementById('deleteNoteEditBtn').classList.remove('hide');

        setTimeout(() => {
            const editor = document.getElementById('noteContentInput');
            editor.innerHTML = parseFormattingForEditor(note.content);
            setupNoteEditorEventListeners(editor);

            // Place cursor at end
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(editor);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }, 100);
    } else {
        document.getElementById('noteEditId').value = '';
        document.getElementById('noteTitleInput').value = '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('noteDateInput').value = today;
        document.getElementById('deleteNoteEditBtn').classList.add('hide');

        setTimeout(() => {
            const editor = document.getElementById('noteContentInput');
            editor.innerHTML = '';
            setupNoteEditorEventListeners(editor);
            editor.focus();
        }, 100);
    }

    App.hideAllModals();
    App.showModal('noteEditModal');
}

function setupNoteEditorEventListeners(editor) {
    let isComposing = false;
    let debounceTimer;
    let justPressedEnter = false;

    // Track composition (multilingual input)
    editor.addEventListener('compositionstart', () => {
        isComposing = true;
    });

    editor.addEventListener('compositionend', () => {
        isComposing = false;
    });

    const handleInput = () => {
        if (isComposing) {
            return;
        }

        if (justPressedEnter) {
            justPressedEnter = false;
            return;
        }

        clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            const plainText = getPlainTextFromEditor(editor);
            const cursorPos = getCaretCharacterOffsetWithin(editor);

            editor.innerHTML = parseFormattingForEditor(plainText);

            setCaretCharacterOffsetWithin(editor, cursorPos);
        }, 500);
    };

    // Handle Enter key properly - immediately insert newline
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();

            // Insert a <br> at cursor position using execCommand
            document.execCommand('insertLineBreak');

            // Trigger formatting update immediately
            setTimeout(() => {
                const plainText = getPlainTextFromEditor(editor);
                const cursorPos = getCaretCharacterOffsetWithin(editor);

                editor.innerHTML = parseFormattingForEditor(plainText);
                setCaretCharacterOffsetWithin(editor, cursorPos);
            }, 10);

            return false;
        }
    };

    editor.removeEventListener('input', handleInput);
    editor.removeEventListener('keydown', handleKeyDown);
    editor.addEventListener('input', handleInput);
    editor.addEventListener('keydown', handleKeyDown);
}

function getCaretCharacterOffsetWithin(element) {
    let caretOffset = 0;
    const sel = window.getSelection();

    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);

        // Get the text content directly from the range
        const tempDiv = document.createElement('div');
        tempDiv.appendChild(preCaretRange.cloneContents());

        // Replace BR tags with newlines before getting text
        tempDiv.querySelectorAll('br').forEach(br => {
            br.replaceWith('\n');
        });

        caretOffset = tempDiv.textContent.length;
    }

    return caretOffset;
}

function setCaretCharacterOffsetWithin(element, offset) {
    const sel = window.getSelection();
    const range = document.createRange();

    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null
    );

    let charCount = 0;
    let found = false;
    let node;

    while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            const textLength = node.textContent.length;

            if (offset <= charCount + textLength) {
                const offsetInNode = offset - charCount;
                range.setStart(node, offsetInNode);
                range.collapse(true);
                found = true;
                break;
            }

            charCount += textLength;
        } else if (node.nodeName === 'BR') {
            charCount += 1; // BR counts as 1 character (newline)

            if (offset === charCount) {
                // Position is right after this BR
                range.setStartAfter(node);
                range.collapse(true);
                found = true;
                break;
            }
        }
    }

    if (!found) {
        range.selectNodeContents(element);
        range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
}

// Keep old functions for backward compatibility but mark as unused
function saveCursorPosition(editor) {
    return getCaretCharacterOffsetWithin(editor);
}

function restoreCursorPosition(editor, position) {
    setCaretCharacterOffsetWithin(editor, position);
}

async function saveNote() {
    const noteId = document.getElementById('noteEditId').value;
    const title = document.getElementById('noteTitleInput').value.trim();
    const datestamp = document.getElementById('noteDateInput').value;
    const editor = document.getElementById('noteContentInput');
    const content = getPlainTextFromEditor(editor).trim();

    if (!content) {
        return App.showNotification('Note content cannot be empty', true);
    }

    if (!datestamp) {
        return App.showNotification('Please select a date', true);
    }

    const noteData = {
        id: noteId || generateNoteId(),
        title: title || null,
        content,
        datestamp,
        createdAt: noteId ? (App.state.currentNote?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (noteId) {
        const index = App.state.notes.findIndex(n => n.id === noteId);
        if (index !== -1) {
            // Add old version to recycle bin before updating
            const oldNote = App.state.notes[index];
            if (!App.state.notesRecycleBin) {
                App.state.notesRecycleBin = [];
            }
            App.state.notesRecycleBin.push({
                ...oldNote,
                deletedAt: new Date().toISOString(),
                reason: 'edited'
            });

            App.state.notes[index] = noteData;
        }
    } else {
        App.state.notes.push(noteData);
    }

    saveNotesToLocalStorage();
    App.hideAllModals();
    renderNotes();
    App.showNotification(noteId ? 'Note updated!' : 'Note created!');
}

function generateNoteId() {
    // Generate a 32-character unique ID
    const timestamp = Date.now().toString(36);
    const randomPart1 = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    const id = (timestamp + randomPart1 + randomPart2).substring(0, 32).padEnd(32, '0');
    return id;
}

async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const index = App.state.notes.findIndex(n => n.id === noteId);
    if (index !== -1) {
        const deletedNote = App.state.notes[index];

        // Add note ID to deleted IDs list (prevents re-sync)
        if (!App.state.notesDeletedIds) {
            App.state.notesDeletedIds = [];
        }
        if (!App.state.notesDeletedIds.includes(noteId)) {
            App.state.notesDeletedIds.push(noteId);
        }

        // Add to recycle bin 2 (user-facing)
        if (!App.state.notesRecycleBin2) {
            App.state.notesRecycleBin2 = [];
        }
        App.state.notesRecycleBin2.push({
            ...deletedNote,
            deletedAt: new Date().toISOString()
        });

        // Remove from active notes
        App.state.notes.splice(index, 1);
        
        saveNotesToLocalStorage();
        updateUnsyncedCount();
        App.hideAllModals();
        renderNotes();
        App.showNotification('Note moved to recycle bin');
    }
}

function checkUnsavedChanges() {
    const noteId = document.getElementById('noteEditId').value;
    const title = document.getElementById('noteTitleInput').value.trim();
    const datestamp = document.getElementById('noteDateInput').value;
    const editor = document.getElementById('noteContentInput');
    const content = getPlainTextFromEditor(editor).trim();

    if (noteId) {
        const originalNote = App.state.notes.find(n => n.id === noteId);
        if (originalNote) {
            const hasChanges =
                (title || '') !== (originalNote.title || '') ||
                datestamp !== originalNote.datestamp ||
                content !== originalNote.content;
            return hasChanges;
        }
    } else {
        return content.length > 0 || title.length > 0;
    }

    return false;
}

// Expose functions to App
window.NotesModule = {
    canAccessNotes,
    canBackupNotesToCloud,
    loadNotesFromLocalStorage,
    saveNotesToLocalStorage,
    syncNotesFromServer,
    exportNotesToFile,
    importNotesFromFile,
    backupNotesToServer,
    updateUnsyncedCount,
    loadNotes,
    renderNotes,
    renderRecycleBin,
    stripFormatting,
    parseFormatting: parseFormattingForDisplay,
    viewNote,
    renderFormattedContent: parseFormattingForDisplay,
    editNote,
    setupNoteEditorEventListeners,
    saveNote,
    generateNoteId,
    deleteNote,
    checkUnsavedChanges,
    enterEditMode,
    exitEditMode,
    switchToYourNotesTab,
    switchToRecycleBinTab,
    deleteSelectedNotes,
    deleteFromRecycleBin,
    reviveSelectedNotes
};