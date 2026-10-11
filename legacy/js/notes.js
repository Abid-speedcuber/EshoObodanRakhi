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
        } else {
            App.state.notes = [];
        }

        // Recycle bin tier 1 (visible) - deletedIds for backwards compatibility
        const deletedIdsKey = `notes_deletedIds_${userId}`;
        const deletedIds = localStorage.getItem(deletedIdsKey);
        App.state.notesDeletedIds = deletedIds ? JSON.parse(deletedIds) : [];

        // Recycle bin tier 1 (visible) - actual deleted notes
        const recycleBin2Key = `notes_recycleBin2_${userId}`;
        const recycleBin2 = localStorage.getItem(recycleBin2Key);
        App.state.notesRecycleBin2 = recycleBin2 ? JSON.parse(recycleBin2) : [];

        // Recycle bin tier 2 (permanent deletion blocker) - just IDs
        const recycleBinKey = `notes_recycleBin_${userId}`;
        const recycleBin = localStorage.getItem(recycleBinKey);
        App.state.notesRecycleBin = recycleBin ? JSON.parse(recycleBin) : [];
        
        console.log(`Loaded from localStorage [${userId}] - notes:`, App.state.notes.length, 'recycleBin tier1:', App.state.notesRecycleBin2.length, 'recycleBin tier2:', App.state.notesRecycleBin.length);
        
        // Ensure all notes have proper UUID format
        let needsSave = false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        App.state.notes.forEach(note => {
            if (!note.id || !uuidRegex.test(note.id)) {
                note.id = generateNoteId();
                needsSave = true;
            }
        });
        if (needsSave) {
            saveNotesToLocalStorage();
        }
    } catch (err) {
        console.error('Error loading notes from localStorage:', err);
        App.state.notes = [];
        App.state.notesDeletedIds = [];
        App.state.notesRecycleBin2 = [];
        App.state.notesRecycleBin3 = [];
    }
}

function saveNotesToLocalStorage() {
    try {
        const userId = App.state.userProfile?.id || 'guest';
        const notesKey = `notes_${userId}`;
        localStorage.setItem(notesKey, JSON.stringify(App.state.notes || []));

        const deletedIdsKey = `notes_deletedIds_${userId}`;
        localStorage.setItem(deletedIdsKey, JSON.stringify(App.state.notesDeletedIds || []));

        const recycleBin2Key = `notes_recycleBin2_${userId}`;
        localStorage.setItem(recycleBin2Key, JSON.stringify(App.state.notesRecycleBin2 || []));

        const recycleBinKey = `notes_recycleBin_${userId}`;
        localStorage.setItem(recycleBinKey, JSON.stringify(App.state.notesRecycleBin || []));
        
        console.log(`Saved to localStorage [${userId}] - notes:`, App.state.notes.length, 'recycleBin tier1:', App.state.notesRecycleBin2.length, 'recycleBin tier2:', App.state.notesRecycleBin.length);
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
        
        // 3 buckets: main notes, recycle bin tier 1, recycle bin tier 2 (permanent blocker)
        const localNoteIds = new Set(App.state.notes.map(n => n.id));
        const recycleBin1Ids = new Set((App.state.notesRecycleBin2 || []).map(n => n.id));
        const recycleBin2Ids = new Set(App.state.notesRecycleBin || []);

        let addedNotes = 0;
        let addedToRecycleBin = 0;
        let skipped = 0;

        // Process server notes - only add notes we don't have in any bucket
        serverNotes.forEach(serverNote => {
            const noteId = serverNote.id;
            
            // Skip if exists in ANY bucket
            if (localNoteIds.has(noteId) || recycleBin1Ids.has(noteId) || recycleBin2Ids.has(noteId)) {
                skipped++;
                return;
            }
            
            // This is a new note from server - add it
            const noteData = {
                id: noteId,
                title: serverNote.title,
                content: serverNote.content,
                datestamp: serverNote.datestamp,
                createdAt: serverNote.created_at,
                updatedAt: serverNote.updated_at
            };

            if (serverNote.is_deleted) {
                // Add to recycle bin tier 1
                noteData.deletedAt = serverNote.updated_at;
                if (!App.state.notesRecycleBin2) {
                    App.state.notesRecycleBin2 = [];
                }
                App.state.notesRecycleBin2.push(noteData);
                addedToRecycleBin++;
            } else {
                // Add to active notes
                App.state.notes.push(noteData);
                addedNotes++;
            }
        });
        
        // Only save if we actually added something
        if (addedNotes > 0 || addedToRecycleBin > 0) {
            saveNotesToLocalStorage();
            console.log(`Sync: Added ${addedNotes} notes, ${addedToRecycleBin} to recycle bin (skipped ${skipped} existing). Total: ${App.state.notes.length} active, ${App.state.notesRecycleBin2.length} in tier1, ${App.state.notesRecycleBin.length} in tier2`);
        } else {
            console.log(`Sync: No new notes from server (skipped ${skipped} existing). Current: ${App.state.notes.length} active, ${App.state.notesRecycleBin2.length} in tier1, ${App.state.notesRecycleBin.length} in tier2`);
        }

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());

    } catch (err) {
        console.error('Error syncing notes from server:', err);
    }
}

function exportNotesToFile() {
    if (!canAccessNotes()) {
        return App.showNotification('You need access to notes feature', true);
    }

    if (App.state.notes.length === 0 && (!App.state.notesRecycleBin2 || App.state.notesRecycleBin2.length === 0)) {
        return App.showNotification('No notes to export', true);
    }

    // Combine active notes and deleted notes
    const allNotes = [
        ...App.state.notes.map(note => ({ ...note, isDeleted: false })),
        ...(App.state.notesRecycleBin2 || []).map(note => ({ ...note, isDeleted: true }))
    ];

    const dataStr = JSON.stringify(allNotes, null, 2);
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

    App.showNotification(`Exported ${App.state.notes.length} active and ${App.state.notesRecycleBin2?.length || 0} deleted notes!`);
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
            const importedData = JSON.parse(e.target.result);

            if (!Array.isArray(importedData)) {
                throw new Error('Invalid notes format');
            }

            // Separate active notes and deleted notes
            const importedActiveNotes = [];
            const importedDeletedNotes = [];
            
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            
            importedData.forEach(note => {
                if (!note.id || !uuidRegex.test(note.id) || !note.content || !note.datestamp) {
                    return; // Skip invalid notes
                }
                
                if (note.isDeleted) {
                    importedDeletedNotes.push(note);
                } else {
                    importedActiveNotes.push(note);
                }
            });

            if (importedActiveNotes.length === 0 && importedDeletedNotes.length === 0) {
                throw new Error('No valid notes found in file');
            }

            const replace = confirm(
                `Found ${importedActiveNotes.length} active notes and ${importedDeletedNotes.length} deleted notes.\n\n` +
                `Replace existing notes? (OK = Replace, Cancel = Merge with existing)`
            );

            const existingIds = new Set(App.state.notes.map(n => n.id));
            const deletedIds = new Set(App.state.notesDeletedIds || []);
            const recycleBinIds = new Set((App.state.notesRecycleBin2 || []).map(n => n.id));

            if (replace) {
                // Replace mode: clear everything and import
                App.state.notes = importedActiveNotes;
                App.state.notesRecycleBin2 = importedDeletedNotes;
                App.state.notesDeletedIds = importedDeletedNotes.map(n => n.id);
            } else {
                // Merge mode: only add notes that don't exist
                
                // Merge active notes (skip if ID exists in active notes OR deleted IDs)
                importedActiveNotes.forEach(note => {
                    if (!existingIds.has(note.id) && !deletedIds.has(note.id)) {
                        App.state.notes.push(note);
                    }
                });
                
                // Merge deleted notes (skip if ID exists in recycle bin OR deleted IDs)
                importedDeletedNotes.forEach(note => {
                    if (!recycleBinIds.has(note.id) && !deletedIds.has(note.id)) {
                        App.state.notesRecycleBin2.push(note);
                        if (!App.state.notesDeletedIds.includes(note.id)) {
                            App.state.notesDeletedIds.push(note.id);
                        }
                    }
                });
            }

            saveNotesToLocalStorage();
            renderNotes();
            App.showNotification(`Successfully imported ${importedActiveNotes.length} active and ${importedDeletedNotes.length} deleted notes!`);

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

        // Prepare all notes (active + recycle bin tier 1) for upload
        const allNotesToInsert = [];
        
        // Add active notes
        if (App.state.notes.length > 0) {
            App.state.notes.forEach(note => {
                allNotesToInsert.push({
                    id: note.id,
                    user_id: App.state.currentUser.id,
                    title: note.title || null,
                    content: note.content,
                    datestamp: note.datestamp,
                    is_deleted: false,
                    created_at: note.createdAt || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            });
        }
        
        // Add deleted notes from recycle bin tier 1
        if (App.state.notesRecycleBin2 && App.state.notesRecycleBin2.length > 0) {
            App.state.notesRecycleBin2.forEach(note => {
                allNotesToInsert.push({
                    id: note.id,
                    user_id: App.state.currentUser.id,
                    title: note.title || null,
                    content: note.content,
                    datestamp: note.datestamp,
                    is_deleted: true,
                    created_at: note.createdAt || new Date().toISOString(),
                    updated_at: note.deletedAt || new Date().toISOString()
                });
            });
        }

        // Upload all notes to server
        if (allNotesToInsert.length > 0) {
            const { error: insertError } = await db.from('notes').insert(allNotesToInsert);

            if (insertError) throw insertError;
        }

        // After successful upload, clear recycle bin tier 2 (no more garbage from supabase)
        App.state.notesRecycleBin = [];
        
        saveNotesToLocalStorage();

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());

        const totalBackedUp = allNotesToInsert.length;
        App.showNotification(`Successfully backed up ${totalBackedUp} note(s) to cloud!`);
        updateUnsyncedCount();
        
    } catch (err) {
        console.error('Error backing up notes:', err);
        App.showNotification('Failed to backup notes: ' + err.message, true);
    }
}

async function updateUnsyncedCount() {
    const unsyncedElement = document.getElementById('notesUnsyncedCount');
    if (!unsyncedElement) return;

    if (!App.state.currentUser) {
        unsyncedElement.textContent = '';
        return;
    }

    try {
        // Fetch server notes to compare
        const { data, error } = await db.from('notes').select('id').eq('user_id', App.state.currentUser.id);
        
        if (error) throw error;

        const serverNoteIds = new Set((data || []).map(n => n.id));
        const localNoteIds = new Set(App.state.notes.map(n => n.id));
        
        // Count notes that are in local but not in server
        const unsyncedCount = Array.from(localNoteIds).filter(id => !serverNoteIds.has(id)).length;

        if (unsyncedCount === 0) {
            unsyncedElement.textContent = '';
            unsyncedElement.style.display = 'none';
        } else if (unsyncedCount === 1) {
            unsyncedElement.textContent = 'You have 1 note you haven\'t backed up';
            unsyncedElement.style.display = 'block';
        } else {
            unsyncedElement.textContent = `You have ${unsyncedCount} notes you haven't backed up`;
            unsyncedElement.style.display = 'block';
        }
    } catch (err) {
        console.error('Error checking unsynced count:', err);
        // Fallback to local count
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
}

async function loadNotes() {
    if (App.state.isLoading.notes) return;
    App.state.isLoading.notes = true;

    // ALWAYS load from local storage first
    loadNotesFromLocalStorage();

    // Show edit mode button only if user has access
    const editModeBtn = document.getElementById('notesEditModeBtn');
    if (editModeBtn) {
        editModeBtn.classList.toggle('hide', !canAccessNotes());
    }

    renderNotes();

    // Only sync from server if user is logged in (adds new notes from server, never removes local)
    if (App.state.currentUser && canBackupNotesToCloud()) {
        await syncNotesFromServer();
        renderNotes(); // Re-render after sync
    }

    updateUnsyncedCount();

    // Start periodic unsynced count checker (every 45 seconds)
    if (App.state.currentUser && canBackupNotesToCloud()) {
        if (window.notesUnsyncedInterval) {
            clearInterval(window.notesUnsyncedInterval);
        }
        window.notesUnsyncedInterval = setInterval(() => {
            updateUnsyncedCount();
        }, 45000);
    }

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

    // In edit mode: flat list without grouping
    if (isEditMode) {
        const sortedNotes = [...App.state.notes].sort((a, b) => new Date(b.datestamp) - new Date(a.datestamp));
        
        let html = sortedNotes.map(note => {
            const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
            const preview = stripFormatting(note.content.substring(0, 100)) + (note.content.length > 100 ? '...' : '');
            const date = new Date(note.datestamp);
            const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

            return `
              <div class="bg-white rounded-xl shadow-lg p-4 note-selectable flex items-center transition" data-note-id="${note.id}">
                <input type="checkbox" class="note-checkbox" data-note-id="${note.id}">
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-800">${title}</h3>
                    <span class="text-xs text-gray-500">${formattedDate}</span>
                  </div>
                  <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
                </div>
              </div>
            `;
        }).join('');

        notesList.innerHTML = html;

        // Handle clicks and checkboxes in edit mode
        notesList.querySelectorAll('[data-note-id]').forEach(el => {
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

        notesList.querySelectorAll('.note-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const noteEl = e.target.closest('[data-note-id]');
                if (noteEl) {
                    noteEl.classList.toggle('note-selected', e.target.checked);
                }
            });
        });

        return;
    }

    // Normal mode: grouped by date
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
          <div class="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition" data-note-id="${note.id}">
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
              <h3 class="font-bold text-gray-800">📅 ${formattedDate}</h3>
              <span class="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">${notes.length} notes</span>
            </div>
            <div class="space-y-2">
              ${notes.map(note => {
                const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
                return `
                  <div class="bg-white rounded-lg p-3 cursor-pointer hover:shadow-md transition" data-note-id="${note.id}">
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
        el.addEventListener('click', (e) => {
            const noteId = el.dataset.noteId;
            viewNote(noteId);
        });
    });
}

function filterNotes(searchTerm) {
    if (!searchTerm) {
        renderNotes();
        return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = App.state.notes.filter(note => {
        const title = (note.title || '').toLowerCase();
        const content = note.content.toLowerCase();
        const datestamp = note.datestamp.toLowerCase();
        const id = note.id.toLowerCase();
        
        return title.includes(term) || 
               content.includes(term) || 
               datestamp.includes(term) || 
               id.includes(term);
    });

    const notesList = App.elements.notesList;
    const isEditMode = App.state.notesEditMode || false;

    if (filtered.length === 0) {
        const isBn = localStorage.getItem('lang') === 'bn';
        notesList.innerHTML = `<div class="text-gray-400 text-center py-8">${isBn ? 'কোনো নোট পাওয়া যায়নি' : 'No notes found'}</div>`;
        return;
    }

    // In edit mode: flat list without grouping
    if (isEditMode) {
        const sortedNotes = [...filtered].sort((a, b) => new Date(b.datestamp) - new Date(a.datestamp));
        
        let html = sortedNotes.map(note => {
            const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
            const preview = stripFormatting(note.content.substring(0, 100)) + (note.content.length > 100 ? '...' : '');
            const date = new Date(note.datestamp);
            const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

            return `
              <div class="bg-white rounded-xl shadow-lg p-4 note-selectable flex items-center transition" data-note-id="${note.id}">
                <input type="checkbox" class="note-checkbox" data-note-id="${note.id}">
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-gray-800">${title}</h3>
                    <span class="text-xs text-gray-500">${formattedDate}</span>
                  </div>
                  <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
                </div>
              </div>
            `;
        }).join('');

        notesList.innerHTML = html;

        notesList.querySelectorAll('[data-note-id]').forEach(el => {
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

        notesList.querySelectorAll('.note-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const noteEl = e.target.closest('[data-note-id]');
                if (noteEl) {
                    noteEl.classList.toggle('note-selected', e.target.checked);
                }
            });
        });

        return;
    }

    // Normal mode: grouped by date
    const groupedNotes = {};
    filtered.forEach(note => {
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
          <div class="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition" data-note-id="${note.id}">
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
              <h3 class="font-bold text-gray-800">📅 ${formattedDate}</h3>
              <span class="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">${notes.length} notes</span>
            </div>
            <div class="space-y-2">
              ${notes.map(note => {
                const title = stripFormatting(note.title || note.content.split('\n')[0].substring(0, 50) || 'Untitled');
                return `
                  <div class="bg-white rounded-lg p-3 cursor-pointer hover:shadow-md transition" data-note-id="${note.id}">
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
        el.addEventListener('click', (e) => {
            const noteId = el.dataset.noteId;
            viewNote(noteId);
        });
    });
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

    const actualCount = selectedIds.length;
    
    if (!confirm(`Are you sure you want to delete ${actualCount} note(s)?`)) {
        return;
    }

    // Initialize arrays if needed
    if (!App.state.notesDeletedIds) {
        App.state.notesDeletedIds = [];
    }
    if (!App.state.notesRecycleBin2) {
        App.state.notesRecycleBin2 = [];
    }

    let deletedCount = 0;
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
            deletedCount++;
        }
    });

    saveNotesToLocalStorage();
    console.log('After delete - notes:', App.state.notes.length, 'recycleBin:', App.state.notesRecycleBin2.length);

    // Update tab count
    document.getElementById('notesTabYourNotesCount').textContent = App.state.notes.length;
    document.getElementById('notesTabRecycleBinCount').textContent = App.state.notesRecycleBin2.length;

    renderNotes();
    App.showNotification(`Deleted ${deletedCount} note(s)`);
}

function deleteFromRecycleBin() {
    const selectedIds = getSelectedNotes(true);

    if (selectedIds.length === 0) {
        return App.showNotification('Please select notes to delete permanently', true);
    }

    if (!confirm(`Are you sure you want to permanently delete ${selectedIds.length} note(s)? This cannot be undone.`)) {
        return;
    }

    // Move to recycle bin tier 2 (permanent deletion blocker)
    if (!App.state.notesRecycleBin) {
        App.state.notesRecycleBin = [];
    }

    selectedIds.forEach(noteId => {
        const noteIndex = App.state.notesRecycleBin2.findIndex(n => n.id === noteId);
        if (noteIndex !== -1) {
            App.state.notesRecycleBin2.splice(noteIndex, 1);
        }
        
        // Add to tier 2 to block re-sync
        if (!App.state.notesRecycleBin.includes(noteId)) {
            App.state.notesRecycleBin.push(noteId);
        }
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
            
            // Remove from recycle bin tier 1
            App.state.notesRecycleBin2.splice(noteIndex, 1);
            
            // Remove from deleted IDs list
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
            
            // Show scroll-to-bottom button if content is long
            updateScrollToBottomButton();
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
            
            // Hide scroll-to-bottom button for new notes
            updateScrollToBottomButton();
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
            updateScrollToBottomButton();
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
                updateScrollToBottomButton();
            }, 10);

            return false;
        }
    };

    // Handle scroll events to update button visibility
    const handleScroll = () => {
        updateScrollToBottomButton();
    };

    editor.removeEventListener('input', handleInput);
    editor.removeEventListener('keydown', handleKeyDown);
    editor.removeEventListener('scroll', handleScroll);
    editor.addEventListener('input', handleInput);
    editor.addEventListener('keydown', handleKeyDown);
    editor.addEventListener('scroll', handleScroll);
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
            App.state.notes[index] = noteData;
        }
    } else {
        App.state.notes.push(noteData);
    }

    saveNotesToLocalStorage();
    updateUnsyncedCount();
    App.hideAllModals();
    renderNotes();
    App.showNotification(noteId ? 'Note updated!' : 'Note created!');
}

function generateNoteId() {
    // Generate a proper UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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

function updateScrollToBottomButton() {
    const editor = document.getElementById('noteContentInput');
    if (!editor) return;
    
    let scrollBtn = document.getElementById('scrollToBottomBtn');
    
    // Check if editor is scrollable and not at bottom
    const isScrollable = editor.scrollHeight > editor.clientHeight;
    const isAtBottom = Math.abs(editor.scrollHeight - editor.clientHeight - editor.scrollTop) < 5;
    
    if (isScrollable && !isAtBottom) {
        // Show button
        if (!scrollBtn) {
            // Create button if it doesn't exist
            scrollBtn = document.createElement('button');
            scrollBtn.id = 'scrollToBottomBtn';
            scrollBtn.type = 'button';
            scrollBtn.className = 'scroll-to-bottom-btn';
            scrollBtn.innerHTML = '⬇';
            scrollBtn.title = 'Scroll to bottom';
            scrollBtn.addEventListener('click', scrollToBottom);
            
            // Insert button inside note-editor-wrapper
            const wrapper = document.querySelector('.note-editor-wrapper');
            if (wrapper) {
                wrapper.appendChild(scrollBtn);
            }
        }
        scrollBtn.style.display = 'block';
    } else {
        // Hide button
        if (scrollBtn) {
            scrollBtn.style.display = 'none';
        }
    }
}

function scrollToBottom() {
    const editor = document.getElementById('noteContentInput');
    if (editor) {
        editor.scrollTo({
            top: editor.scrollHeight,
            behavior: 'smooth'
        });
        
        // Update button visibility after scroll completes
        setTimeout(() => {
            updateScrollToBottomButton();
        }, 300);
    }
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
    filterNotes,
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