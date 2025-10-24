// Row Universe Editor for Notes
class RowUniverseEditor {
    constructor(editor) {
        this.rows = [[]];
        this.currentRow = 0;
        this.currentCol = 0;
        this.activeFormatting = {
            bold: null,
            italic: false,
            underline: null,
            highlight: null,
            color: null
        };
        this.formattingOverridden = false;
        this.lastBoldValue = 'medium';
        this.lastUnderlineValue = 'single';
        this.lastHighlightValue = 'yellow';
        this.lastColorValue = 'red';
        this.editor = editor;
        this.init();
    }

    init() {
        this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.editor.addEventListener('mouseup', () => this.updateToolbarFromCursor());
        this.editor.addEventListener('keyup', (e) => {
            if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
                this.updateCursorPosition();
                this.updateToolbarFromCursor();
            }
        });

        this.render();
        this.updateToolbar();
    }

    loadContent(content) {
        if (!content || content.trim() === '') {
            this.rows = [[]];
            this.currentRow = 0;
            this.currentCol = 0;
            this.render();
            return;
        }

        const lines = content.split('\n');
        this.rows = lines.map(line => {
            const row = [];
            let i = 0;
            while (i < line.length) {
                let char = line[i];
                let formatting = {
                    bold: null,
                    italic: false,
                    underline: null,
                    highlight: null,
                    color: null
                };

                let tagsParsed = true;
                while (tagsParsed && i < line.length) {
                    tagsParsed = false;

                    if (line.substring(i).startsWith('<b:')) {
                        const match = line.substring(i).match(/^<b:(light|medium|heavy)>/);
                        if (match) {
                            formatting.bold = match[1];
                            i += match[0].length;
                            tagsParsed = true;
                        }
                    }

                    if (line.substring(i).startsWith('<i>')) {
                        formatting.italic = true;
                        i += 3;
                        tagsParsed = true;
                    }

                    if (line.substring(i).startsWith('<u:')) {
                        const match = line.substring(i).match(/^<u:(single|double|dotted|dashed|wavy)>/);
                        if (match) {
                            formatting.underline = match[1];
                            i += match[0].length;
                            tagsParsed = true;
                        }
                    }

                    if (line.substring(i).startsWith('<h:')) {
                        const match = line.substring(i).match(/^<h:(yellow|green|blue|pink|orange)>/);
                        if (match) {
                            formatting.highlight = match[1];
                            i += match[0].length;
                            tagsParsed = true;
                        }
                    }

                    if (line.substring(i).startsWith('<c:')) {
                        const match = line.substring(i).match(/^<c:(red|blue|green|purple|orange|gray)>/);
                        if (match) {
                            formatting.color = match[1];
                            i += match[0].length;
                            tagsParsed = true;
                        }
                    }
                }

                if (i < line.length) {
                    char = line[i];
                    i++;

                    while (i < line.length) {
                        const remaining = line.substring(i);
                        let closingTagFound = false;

                        if (remaining.startsWith('</b>')) {
                            i += 4;
                            closingTagFound = true;
                        } else if (remaining.startsWith('</i>')) {
                            i += 4;
                            closingTagFound = true;
                        } else if (remaining.startsWith('</u>')) {
                            i += 4;
                            closingTagFound = true;
                        } else if (remaining.startsWith('</h>')) {
                            i += 4;
                            closingTagFound = true;
                        } else if (remaining.startsWith('</c>')) {
                            i += 4;
                            closingTagFound = true;
                        }

                        if (!closingTagFound) break;
                    }

                    row.push({ char, formatting });
                }
            }
            return row;
        });

        if (this.rows.length === 0) {
            this.rows = [[]];
        }

        this.currentRow = 0;
        this.currentCol = 0;
        this.render();
    }

    getPlainText() {
        return this.rows.map(row =>
            row.map(cell => cell.char).join('')
        ).join('\n');
    }

    handleKeyDown(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'i') { e.preventDefault(); this.toggleFormat('italic'); return; }
            if (e.key === 'b') { e.preventDefault(); this.toggleFormat('bold'); return; }
            if (e.key === 'u') { e.preventDefault(); this.toggleFormat('underline'); return; }
        }

        const sel = window.getSelection();
        const hasSelection = sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;

        if (hasSelection) {
            const range = this.getSelectionRange();
            if (range) {
                if (e.key === 'Backspace' || e.key === 'Delete') {
                    e.preventDefault();
                    this.deleteRange(range);
                    this.render();
                    this.updateToolbar();
                    return;
                }
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.deleteRange(range);
                    this.insertCharacter(e.key);
                    return;
                }
            }
        }

        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            this.insertCharacter(e.key);
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            this.handleBackspace();
        } else if (e.key === 'Delete') {
            e.preventDefault();
            this.handleDelete();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            this.handleEnter();
        }
    }

    insertCharacter(char) {
        this.updateCursorPosition();
        const row = this.rows[this.currentRow];
        const newCell = {
            char: char,
            formatting: { ...this.activeFormatting }
        };
        row.splice(this.currentCol, 0, newCell);
        this.currentCol++;
        this.formattingOverridden = false;
        this.render();
        this.updateToolbar();
    }

    handleBackspace() {
        this.updateCursorPosition();
        const row = this.rows[this.currentRow];

        if (this.currentCol > 0) {
            row.splice(this.currentCol - 1, 1);
            this.currentCol--;
            this.render();
            this.updateToolbarFromCursor();
        } else if (this.currentRow > 0) {
            const prevRow = this.rows[this.currentRow - 1];
            const mergePos = prevRow.length;
            prevRow.push(...row);
            this.rows.splice(this.currentRow, 1);
            this.currentRow--;
            this.currentCol = mergePos;
            this.render();
            this.updateToolbarFromCursor();
        }
    }

    handleDelete() {
        this.updateCursorPosition();
        const row = this.rows[this.currentRow];

        if (this.currentCol < row.length) {
            row.splice(this.currentCol, 1);
            this.render();
            this.updateToolbarFromCursor();
        } else if (this.currentRow < this.rows.length - 1) {
            const nextRow = this.rows[this.currentRow + 1];
            row.push(...nextRow);
            this.rows.splice(this.currentRow + 1, 1);
            this.render();
            this.updateToolbarFromCursor();
        }
    }

    handleEnter() {
        const row = this.rows[this.currentRow];
        const rightPart = row.splice(this.currentCol);
        this.rows.splice(this.currentRow + 1, 0, rightPart);
        this.currentRow++;
        this.currentCol = 0;
        this.render();
    }

    toggleFormat(format) {
        const range = this.getSelectionRange();

        if (range && !range.collapsed) {
            const allHaveFormat = this.checkRangeFormatting(range, format);

            for (let r = range.startRow; r <= range.endRow; r++) {
                const row = this.rows[r];
                const startCol = (r === range.startRow) ? range.startCol : 0;
                const endCol = (r === range.endRow) ? range.endCol : row.length;

                for (let c = startCol; c < endCol; c++) {
                    if (row[c]) {
                        if (format === 'bold') {
                            row[c].formatting[format] = !allHaveFormat ? this.lastBoldValue : null;
                        } else if (format === 'underline') {
                            row[c].formatting[format] = !allHaveFormat ? this.lastUnderlineValue : null;
                        } else {
                            row[c].formatting[format] = !allHaveFormat;
                        }
                    }
                }
            }

            this.render();
            this.restoreSelection(range);
        } else {
            if (format === 'bold') {
                this.activeFormatting[format] = this.activeFormatting[format] ? null : this.lastBoldValue;
            } else if (format === 'underline') {
                this.activeFormatting[format] = this.activeFormatting[format] ? null : this.lastUnderlineValue;
            } else {
                this.activeFormatting[format] = !this.activeFormatting[format];
            }
            this.formattingOverridden = true;
            this.updateToolbar();
        }
    }

    applyFormatWithValue(format, value) {
        if (format === 'bold') this.lastBoldValue = value;
        if (format === 'underline') this.lastUnderlineValue = value;
        if (format === 'highlight') this.lastHighlightValue = value;
        if (format === 'color') this.lastColorValue = value;

        const range = this.getSelectionRange();

        if (range && !range.collapsed) {
            const allHaveFormat = this.checkRangeFormattingValue(range, format, value);

            for (let r = range.startRow; r <= range.endRow; r++) {
                const row = this.rows[r];
                const startCol = (r === range.startRow) ? range.startCol : 0;
                const endCol = (r === range.endRow) ? range.endCol : row.length;

                for (let c = startCol; c < endCol; c++) {
                    if (row[c]) {
                        row[c].formatting[format] = allHaveFormat ? null : value;
                    }
                }
            }

            this.render();
            this.restoreSelection(range);
        } else {
            this.activeFormatting[format] = (this.activeFormatting[format] === value) ? null : value;
            this.formattingOverridden = true;
            this.updateToolbar();
        }
    }

    checkRangeFormatting(range, format) {
        for (let r = range.startRow; r <= range.endRow; r++) {
            const row = this.rows[r];
            const startCol = (r === range.startRow) ? range.startCol : 0;
            const endCol = (r === range.endRow) ? range.endCol : row.length;

            for (let c = startCol; c < endCol; c++) {
                if (row[c]) {
                    if (format === 'bold' || format === 'underline') {
                        if (!row[c].formatting[format]) return false;
                    } else {
                        if (!row[c].formatting[format]) return false;
                    }
                }
            }
        }
        return true;
    }

    checkRangeFormattingValue(range, format, value) {
        for (let r = range.startRow; r <= range.endRow; r++) {
            const row = this.rows[r];
            const startCol = (r === range.startRow) ? range.startCol : 0;
            const endCol = (r === range.endRow) ? range.endCol : row.length;

            for (let c = startCol; c < endCol; c++) {
                if (row[c] && row[c].formatting[format] !== value) {
                    return false;
                }
            }
        }
        return true;
    }

    deleteRange(range) {
        if (range.startRow === range.endRow) {
            const row = this.rows[range.startRow];
            row.splice(range.startCol, range.endCol - range.startCol);
        } else {
            const firstRow = this.rows[range.startRow];
            const lastRow = this.rows[range.endRow];
            const keepFromFirst = firstRow.slice(0, range.startCol);
            const keepFromLast = lastRow.slice(range.endCol);
            const mergedRow = [...keepFromFirst, ...keepFromLast];
            this.rows[range.startRow] = mergedRow;
            const rowsToDelete = range.endRow - range.startRow;
            this.rows.splice(range.startRow + 1, rowsToDelete);
        }

        this.currentRow = range.startRow;
        this.currentCol = range.startCol;
    }

    getSelectionRange() {
        const sel = window.getSelection();
        if (sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) return null;

        const range = sel.getRangeAt(0);
        const rows = this.editor.querySelectorAll('.note-row');

        let startRow = -1, startCol = -1;
        let endRow = -1, endCol = -1;

        for (let r = 0; r < rows.length; r++) {
            const rowElement = rows[r];
            const cells = rowElement.querySelectorAll('.note-cell');

            for (let c = 0; c < cells.length; c++) {
                const cell = cells[c];

                if (cell.contains(range.startContainer) || cell === range.startContainer) {
                    if (startRow === -1) {
                        startRow = r;
                        startCol = c;
                    }
                }

                if (cell.contains(range.endContainer) || cell === range.endContainer) {
                    endRow = r;
                    endCol = c + 1;
                }
            }
        }

        if (startRow === -1 || endRow === -1) return null;

        if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
            return {
                startRow: endRow,
                startCol: endCol - 1,
                endRow: startRow,
                endCol: startCol + 1,
                collapsed: false
            };
        }

        return { startRow, startCol, endRow, endCol, collapsed: false };
    }

    restoreSelection(range) {
        setTimeout(() => {
            const sel = window.getSelection();
            const newRange = document.createRange();
            const rows = this.editor.querySelectorAll('.note-row');

            if (rows[range.startRow] && rows[range.endRow]) {
                const startCells = rows[range.startRow].querySelectorAll('.note-cell');
                const endCells = rows[range.endRow].querySelectorAll('.note-cell');

                if (startCells[range.startCol] && endCells[range.endCol - 1]) {
                    const startNode = startCells[range.startCol].firstChild || startCells[range.startCol];
                    const endNode = endCells[range.endCol - 1].firstChild || endCells[range.endCol - 1];

                    newRange.setStart(startNode, 0);
                    newRange.setEnd(endNode, endNode.textContent ? endNode.textContent.length : 1);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            }
        }, 0);
    }

    updateCursorPosition() {
        const sel = window.getSelection();
        if (sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const rows = this.editor.querySelectorAll('.note-row');

        for (let r = 0; r < rows.length; r++) {
            const rowElement = rows[r];
            if (rowElement.contains(range.startContainer)) {
                this.currentRow = r;
                const cells = rowElement.querySelectorAll('.note-cell');
                let foundCol = false;

                for (let c = 0; c < cells.length; c++) {
                    if (cells[c].contains(range.startContainer) || cells[c] === range.startContainer) {
                        if (range.startContainer.nodeType === Node.TEXT_NODE &&
                            range.startOffset === range.startContainer.length) {
                            this.currentCol = c + 1;
                        } else {
                            this.currentCol = c;
                        }
                        foundCol = true;
                        break;
                    }
                }

                if (!foundCol) {
                    this.currentCol = cells.length;
                }
                break;
            }
        }
    }

    updateToolbarFromCursor() {
        this.updateCursorPosition();

        if (!this.formattingOverridden) {
            const row = this.rows[this.currentRow];
            if (this.currentCol > 0 && row[this.currentCol - 1]) {
                this.activeFormatting = { ...row[this.currentCol - 1].formatting };
            } else if (this.currentCol === 0 && row[0]) {
                this.activeFormatting = { ...row[0].formatting };
            }
        }

        this.updateToolbar();
    }

    updateToolbar() {
        const italicBtn = document.getElementById('noteItalicBtn');
        const boldBtn = document.getElementById('noteBoldBtn');
        const underlineBtn = document.getElementById('noteUnderlineBtn');
        const highlightBtn = document.getElementById('noteHighlightBtn');
        const colorBtn = document.getElementById('noteColorBtn');

        if (italicBtn) {
            if (this.activeFormatting.italic) {
                italicBtn.style.backgroundColor = '#93c5fd';
                italicBtn.style.borderColor = '#3b82f6';
            } else {
                italicBtn.style.backgroundColor = '#e5e7eb';
                italicBtn.style.borderColor = 'transparent';
            }
        }

        if (boldBtn) {
            if (this.activeFormatting.bold !== null) {
                boldBtn.style.backgroundColor = '#93c5fd';
                boldBtn.style.borderColor = '#3b82f6';
            } else {
                boldBtn.style.backgroundColor = '#e5e7eb';
                boldBtn.style.borderColor = 'transparent';
            }
            boldBtn.style.fontWeight = this.lastBoldValue ?
                (this.lastBoldValue === 'light' ? '500' : this.lastBoldValue === 'medium' ? '700' : '900') : '700';
        }

        if (underlineBtn) {
            if (this.activeFormatting.underline !== null) {
                underlineBtn.style.backgroundColor = '#93c5fd';
                underlineBtn.style.borderColor = '#3b82f6';
            } else {
                underlineBtn.style.backgroundColor = '#e5e7eb';
                underlineBtn.style.borderColor = 'transparent';
            }
            underlineBtn.style.textDecoration = 'underline';
            underlineBtn.style.textDecorationStyle = this.lastUnderlineValue === 'single' ? 'solid' : this.lastUnderlineValue;
        }

        if (highlightBtn) {
            const highlightColors = {
                yellow: '#fff59d', green: '#a5d6a7', blue: '#90caf9',
                pink: '#f48fb1', orange: '#ffcc80'
            };
            if (this.activeFormatting.highlight !== null) {
                highlightBtn.style.borderColor = '#3b82f6';
                highlightBtn.style.borderWidth = '2px';
            } else {
                highlightBtn.style.borderColor = 'transparent';
                highlightBtn.style.borderWidth = '1px';
            }
            highlightBtn.style.backgroundColor = this.lastHighlightValue ?
                highlightColors[this.lastHighlightValue] : '#e5e7eb';
        }

        if (colorBtn) {
            const textColors = {
                red: '#d32f2f', blue: '#1976d2', green: '#388e3c',
                purple: '#7b1fa2', orange: '#f57c00', gray: '#616161'
            };
            if (this.activeFormatting.color !== null) {
                colorBtn.style.borderColor = '#3b82f6';
                colorBtn.style.borderWidth = '2px';
            } else {
                colorBtn.style.borderColor = 'transparent';
                colorBtn.style.borderWidth = '1px';
            }
            colorBtn.style.color = this.lastColorValue ? textColors[this.lastColorValue] : '#374151';
            colorBtn.style.fontWeight = '900';
        }
    }

    render() {
        let html = '';

        for (let r = 0; r < this.rows.length; r++) {
            const row = this.rows[r];
            html += '<div class="note-row">';

            for (let c = 0; c < row.length; c++) {
                const cell = row[c];
                const classes = ['note-cell'];

                if (cell.formatting.bold) classes.push(`note-bold-${cell.formatting.bold}`);
                if (cell.formatting.italic) classes.push('note-italic');
                if (cell.formatting.underline) classes.push(`note-underline-${cell.formatting.underline}`);
                if (cell.formatting.highlight) classes.push(`note-highlight-${cell.formatting.highlight}`);
                if (cell.formatting.color) classes.push(`note-color-${cell.formatting.color}`);

                const char = cell.char === ' ' ? '&nbsp;' :
                    cell.char.replace(/</g, '&lt;').replace(/>/g, '&gt;');

                html += `<span class="${classes.join(' ')}">${char}</span>`;
            }

            if (row.length === 0) {
                html += '<br>';
            }

            html += '</div>';
        }

        this.editor.innerHTML = html;
        this.setCursorImmediate();
    }

    setCursorImmediate() {
        const sel = window.getSelection();
        const range = document.createRange();

        const rows = this.editor.querySelectorAll('.note-row');
        if (rows[this.currentRow]) {
            const cells = rows[this.currentRow].querySelectorAll('.note-cell');

            if (cells[this.currentCol]) {
                const textNode = cells[this.currentCol].firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, 0);
                } else {
                    range.setStart(cells[this.currentCol], 0);
                }
            } else if (cells.length > 0) {
                const lastCell = cells[cells.length - 1];
                const textNode = lastCell.firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    range.setStart(textNode, textNode.length);
                } else {
                    range.setStart(lastCell, 1);
                }
            } else {
                range.selectNodeContents(rows[this.currentRow]);
                range.collapse(true);
            }

            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}


// Notes Functions
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

        const recycleBinKey = `notes_recycleBin_${userId}`;
        const recycleBin = localStorage.getItem(recycleBinKey);
        App.state.notesRecycleBin = recycleBin ? JSON.parse(recycleBin) : [];
    } catch (err) {
        console.error('Error loading notes from localStorage:', err);
        App.state.notes = [];
        App.state.notesRecycleBin = [];
    }
}

function saveNotesToLocalStorage() {
    try {
        const userId = App.state.userProfile?.id || 'guest';
        const notesKey = `notes_${userId}`;
        localStorage.setItem(notesKey, JSON.stringify(App.state.notes));

        const recycleBinKey = `notes_recycleBin_${userId}`;
        localStorage.setItem(recycleBinKey, JSON.stringify(App.state.notesRecycleBin || []));
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
        const recycleBin = App.state.notesRecycleBin || [];

        const deletedIds = new Set(recycleBin.map(note => note.id));

        const serverNotesMap = new Map();
        serverNotes.forEach(note => {
            if (!deletedIds.has(note.id)) {
                serverNotesMap.set(note.id, {
                    ...note,
                    datestamp: note.datestamp,
                    isBold: note.is_bold,
                    isHighlighted: note.is_highlighted
                });
            }
        });

        const localNotesMap = new Map();
        localNotes.forEach(note => {
            localNotesMap.set(note.id, note);
        });

        const mergedNotes = [];

        localNotes.forEach(note => {
            mergedNotes.push(note);
        });

        serverNotes.forEach(serverNote => {
            if (!localNotesMap.has(serverNote.id) && !deletedIds.has(serverNote.id)) {
                mergedNotes.push({
                    id: serverNote.id,
                    title: serverNote.title,
                    content: serverNote.content,
                    datestamp: serverNote.datestamp,
                    createdAt: serverNote.created_at,
                    updatedAt: serverNote.updated_at
                });
            }
        });

        App.state.notes = mergedNotes;
        saveNotesToLocalStorage();

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());
        updateLastSyncDisplay();

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

    App.showNotification('Backing up notes to cloud...');

    try {
        const { error: deleteError } = await db.from('notes').delete().eq('user_id', App.state.currentUser.id);

        if (deleteError) throw deleteError;

        if (App.state.notes.length > 0) {
            const notesToInsert = App.state.notes.map(note => ({
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

        App.state.notesRecycleBin = [];
        const userId = App.state.currentUser.id;
        const recycleBinKey = `notes_recycleBin_${userId}`;
        localStorage.removeItem(recycleBinKey);

        const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
        localStorage.setItem(lastSyncKey, new Date().toISOString());
        updateLastSyncDisplay();

        App.showNotification(`Successfully backed up ${App.state.notes.length} note(s) to cloud!`);
    } catch (err) {
        console.error('Error backing up notes:', err);
        App.showNotification('Failed to backup notes: ' + err.message, true);
    }
}

function updateLastSyncDisplay() {
    const lastSyncElement = document.getElementById('notesLastSync');
    if (!lastSyncElement) return;

    if (!App.state.currentUser) {
        lastSyncElement.textContent = '';
        return;
    }

    const lastSyncKey = `notes_lastSync_${App.state.currentUser.id}`;
    const lastSync = localStorage.getItem(lastSyncKey);

    if (lastSync) {
        const syncDate = new Date(lastSync);
        const now = new Date();
        const diffMs = now - syncDate;
        const diffMins = Math.floor(diffMs / 60000);

        let timeAgo;
        if (diffMins < 1) {
            timeAgo = 'just now';
        } else if (diffMins < 60) {
            timeAgo = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffMins < 1440) {
            const hours = Math.floor(diffMins / 60);
            timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else {
            const days = Math.floor(diffMins / 1440);
            timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
        }

        lastSyncElement.textContent = `Last synced: ${timeAgo}`;
    } else {
        lastSyncElement.textContent = 'Never synced';
    }
}

function loadNotes() {
    if (App.state.isLoading.notes) return;
    App.state.isLoading.notes = true;

    loadNotesFromLocalStorage();
    renderNotes();
    updateLastSyncDisplay();

    App.state.isLoading.notes = false;
}

function renderNotes() {
    const notesList = App.elements.notesList;

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
            const title = stripFormatting(note.title || note.content.split('\n')[0].split(' ').slice(0, 3).join(' ') || 'Untitled');
            const preview = stripFormatting(note.content.substring(0, 100)) + (note.content.length > 100 ? '...' : '');

            html += `
          <div class="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition" data-note-id="${note.id}">
            <div class="flex justify-between items-start mb-2">
              <h3 class="font-bold text-gray-800">${title}</h3>
              <span class="text-xs text-gray-500">${formattedDate}</span>
            </div>
            <p class="text-sm text-gray-600 line-clamp-2">${preview}</p>
          </div>
        `;
        } else {
            html += `
          <div class="bg-blue-50 rounded-xl shadow-lg p-4 border-l-4 border-blue-400">
            <div class="flex justify-between items-center mb-3">
              <h3 class="font-bold text-gray-800">📁 ${formattedDate}</h3>
              <span class="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded">${notes.length} notes</span>
            </div>
            <div class="space-y-2">
              ${notes.map(note => {
                const title = stripFormatting(note.title || note.content.split('\n')[0].split(' ').slice(0, 3).join(' ') || 'Untitled');
                return `
                  <div class="bg-white rounded-lg p-3 cursor-pointer hover:shadow-md transition" data-note-id="${note.id}">
                    <p class="text-sm font-semibold text-gray-700">${title}</p>
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
        el.addEventListener('click', () => {
            const noteId = el.dataset.noteId;
            viewNote(noteId);
        });
    });
}

function stripFormatting(text) {
    return text
        .replace(/<\*(.+?)\*>/g, '$1')
        .replace(/<#(.+?)#>/g, '$1')
        .replace(/<_(.+?)_>/g, '$1')
        .replace(/^• /gm, '')
        .replace(/^\d+\. /gm, '');
}

function parseFormatting(text) {
    let html = text
        .replace(/<\*<_<#(.+?)#>_>\*>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<\*<#<_(.+?)_>#>\*>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<_<\*<#(.+?)#>\*>_>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<_<#<\*(.+?)\*>#>_>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<#<\*<_(.+?)_>\*>#>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<#<_<\*(.+?)\*>_>#>/g, '<span style="font-weight: bold; text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<\*<#(.+?)#>\*>/g, '<span style="font-weight: bold; color: #dc2626;">$1</span>')
        .replace(/<#<\*(.+?)\*>#>/g, '<span style="font-weight: bold; color: #dc2626;">$1</span>')
        .replace(/<\*<_(.+?)_>\*>/g, '<span style="font-weight: bold; text-decoration: underline;">$1</span>')
        .replace(/<_<\*(.+?)\*>_>/g, '<span style="font-weight: bold; text-decoration: underline;">$1</span>')
        .replace(/<#<_(.+?)_>#>/g, '<span style="text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<_<#(.+?)#>_>/g, '<span style="text-decoration: underline; color: #dc2626;">$1</span>')
        .replace(/<\*(.+?)\*>/g, '<strong>$1</strong>')
        .replace(/<#(.+?)#>/g, '<span style="color: #dc2626;">$1</span>')
        .replace(/<_(.+?)_>/g, '<span style="text-decoration: underline;">$1</span>')
        .replace(/^• (.+)$/gm, '<div style="margin-left: 20px; padding-left: 10px;">• $1</div>')
        .replace(/^(\d+)\. (.+)$/gm, '<div style="margin-left: 20px; padding-left: 10px;">$1. $2</div>');

    return html;
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
    let html = renderFormattedContent(note.content);
    contentEl.innerHTML = html;

    App.showModal('noteViewModal');
}

function renderFormattedContent(content) {
    const lines = content.split('\n');
    return lines.map(line => {
        let html = '';
        let i = 0;
        while (i < line.length) {
            let char = line[i];
            let styles = [];

            let processed = false;
            let currentPos = i;

            while (true) {
                const remainingText = line.substring(currentPos);
                let matched = false;

                const boldMatch = remainingText.match(/^<b:(light|medium|heavy)>/);
                if (boldMatch) {
                    const weight = boldMatch[1] === 'light' ? '500' : boldMatch[1] === 'medium' ? '700' : '900';
                    styles.push(`font-weight: ${weight}`);
                    currentPos += boldMatch[0].length;
                    matched = true;
                    continue;
                }

                const italicMatch = remainingText.match(/^<i>/);
                if (italicMatch) {
                    styles.push('font-style: italic');
                    currentPos += italicMatch[0].length;
                    matched = true;
                    continue;
                }

                const underlineMatch = remainingText.match(/^<u:(single|double|dotted|dashed|wavy)>/);
                if (underlineMatch) {
                    const style = underlineMatch[1] === 'single' ? 'solid' : underlineMatch[1];
                    styles.push(`text-decoration: underline; text-decoration-style: ${style}`);
                    currentPos += underlineMatch[0].length;
                    matched = true;
                    continue;
                }

                const highlightMatch = remainingText.match(/^<h:(yellow|green|blue|pink|orange)>/);
                if (highlightMatch) {
                    const colors = { yellow: '#fff59d', green: '#a5d6a7', blue: '#90caf9', pink: '#f48fb1', orange: '#ffcc80' };
                    styles.push(`background-color: ${colors[highlightMatch[1]]}`);
                    currentPos += highlightMatch[0].length;
                    matched = true;
                    continue;
                }

                const colorMatch = remainingText.match(/^<c:(red|blue|green|purple|orange|gray)>/);
                if (colorMatch) {
                    const colors = { red: '#d32f2f', blue: '#1976d2', green: '#388e3c', purple: '#7b1fa2', orange: '#f57c00', gray: '#616161' };
                    styles.push(`color: ${colors[colorMatch[1]]}`);
                    currentPos += colorMatch[0].length;
                    matched = true;
                    continue;
                }

                if (!matched) break;
            }

            if (currentPos > i) {
                char = line[currentPos];
                currentPos++;

                while (currentPos < line.length) {
                    const remaining = line.substring(currentPos);
                    if (remaining.startsWith('</b>') || remaining.startsWith('</i>') ||
                        remaining.startsWith('</u>') || remaining.startsWith('</h>') ||
                        remaining.startsWith('</c>')) {
                        const closeMatch = remaining.match(/^<\/(b|i|u|h|c)>/);
                        if (closeMatch) {
                            currentPos += closeMatch[0].length;
                            continue;
                        }
                    }
                    break;
                }

                i = currentPos;
                processed = true;
            } else {
                i++;
            }

            if (styles.length > 0) {
                html += `<span style="${styles.join('; ')}">${char === ' ' ? '&nbsp;' : char}</span>`;
            } else {
                html += char === ' ' ? '&nbsp;' : char;
            }
        }
        return html;
    }).join('<br>');
}

function editNote(noteId = null) {
    let note = null;

    if (noteId) {
        note = App.state.notes.find(n => n.id === noteId);
        if (!note) return;
    }

    App.state.currentNote = note;

    document.querySelectorAll('.note-dropdown').forEach(d => {
        d.classList.remove('active');
    });

    if (note) {
        document.getElementById('noteEditId').value = note.id;
        document.getElementById('noteTitleInput').value = note.title || '';
        document.getElementById('noteDateInput').value = note.datestamp;
        document.getElementById('deleteNoteEditBtn').classList.remove('hide');

        setTimeout(() => {
            const editor = document.getElementById('noteContentInput');
            App.noteEditor = new RowUniverseEditor(editor);
            App.noteEditor.loadContent(note.content);
            setupNoteEditorEventListeners();

            document.querySelectorAll('.note-dropdown').forEach(d => {
                d.classList.remove('active');
            });
        }, 100);

    } else {
        document.getElementById('noteEditId').value = '';
        document.getElementById('noteTitleInput').value = '';
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('noteDateInput').value = today;
        document.getElementById('deleteNoteEditBtn').classList.add('hide');

        setTimeout(() => {
            const editor = document.getElementById('noteContentInput');
            App.noteEditor = new RowUniverseEditor(editor);
            App.noteEditor.loadContent('');
            setupNoteEditorEventListeners();

            document.querySelectorAll('.note-dropdown').forEach(d => {
                d.classList.remove('active');
            });
        }, 100);
    }

    App.hideAllModals();
    App.showModal('noteEditModal');
}

function setupNoteEditorEventListeners() {
    if (App.closeDropdownsHandler) {
        document.removeEventListener('click', App.closeDropdownsHandler);
        App.closeDropdownsHandler = null;
    }

    document.querySelectorAll('.note-dropdown').forEach(d => {
        d.classList.remove('active');
    });

    const italicBtn = document.getElementById('noteItalicBtn');
    const boldBtn = document.getElementById('noteBoldBtn');
    const underlineBtn = document.getElementById('noteUnderlineBtn');
    const highlightBtn = document.getElementById('noteHighlightBtn');
    const colorBtn = document.getElementById('noteColorBtn');

    if (italicBtn) {
        const newItalic = italicBtn.cloneNode(true);
        italicBtn.parentNode.replaceChild(newItalic, italicBtn);
        newItalic.addEventListener('click', (e) => {
            e.preventDefault();
            if (App.noteEditor) App.noteEditor.toggleFormat('italic');
        });
    }

    if (boldBtn) {
        const newBold = boldBtn.cloneNode(true);
        boldBtn.parentNode.replaceChild(newBold, boldBtn);
        newBold.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (App.noteEditor) App.noteEditor.toggleFormat('bold');
        });
    }

    if (underlineBtn) {
        const newUnderline = underlineBtn.cloneNode(true);
        underlineBtn.parentNode.replaceChild(newUnderline, underlineBtn);
        newUnderline.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (App.noteEditor) App.noteEditor.toggleFormat('underline');
        });
    }

    if (highlightBtn) {
        const newHighlight = highlightBtn.cloneNode(true);
        highlightBtn.parentNode.replaceChild(newHighlight, highlightBtn);
        newHighlight.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (App.noteEditor) {
                const value = App.noteEditor.lastHighlightValue;
                App.noteEditor.applyFormatWithValue('highlight', value);
            }
        });
    }

    if (colorBtn) {
        const newColor = colorBtn.cloneNode(true);
        colorBtn.parentNode.replaceChild(newColor, colorBtn);
        newColor.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (App.noteEditor) {
                const value = App.noteEditor.lastColorValue;
                App.noteEditor.applyFormatWithValue('color', value);
            }
        });
    }

    setTimeout(() => {
        document.querySelectorAll('.note-dropdown').forEach(dropdown => {
            dropdown.classList.remove('active');

            const arrowBtn = dropdown.querySelector('button.note-dropdown-arrow');
            if (!arrowBtn) return;

            const newArrowBtn = arrowBtn.cloneNode(true);
            arrowBtn.parentNode.replaceChild(newArrowBtn, arrowBtn);

            newArrowBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const isCurrentlyActive = dropdown.classList.contains('active');

                document.querySelectorAll('.note-dropdown').forEach(d => {
                    d.classList.remove('active');
                });

                if (!isCurrentlyActive) {
                    dropdown.classList.add('active');

                    const dropdownContent = dropdown.querySelector('.note-dropdown-content');
                    const rect = newArrowBtn.getBoundingClientRect();

                    dropdownContent.style.display = 'block';
                    const dropdownRect = dropdownContent.getBoundingClientRect();

                    let top = rect.bottom + 4;
                    let left = rect.left;

                    if (left + dropdownRect.width > window.innerWidth) {
                        left = window.innerWidth - dropdownRect.width - 8;
                    }

                    if (left < 8) {
                        left = 8;
                    }

                    if (top + dropdownRect.height > window.innerHeight) {
                        top = rect.top - dropdownRect.height - 4;
                    }

                    if (top < 8) {
                        top = 8;
                    }

                    dropdownContent.style.top = `${top}px`;
                    dropdownContent.style.left = `${left}px`;
                }
            });

            dropdown.querySelectorAll('[data-note-format]').forEach(optionBtn => {
                const newOptionBtn = optionBtn.cloneNode(true);
                optionBtn.parentNode.replaceChild(newOptionBtn, optionBtn);

                newOptionBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const format = newOptionBtn.dataset.noteFormat;
                    const value = newOptionBtn.dataset.value;
                    if (App.noteEditor) {
                        App.noteEditor.applyFormatWithValue(format, value);
                    }
                    dropdown.classList.remove('active');
                });
            });
        });

        App.closeDropdownsHandler = (e) => {
            if (!e.target.closest('.note-dropdown')) {
                document.querySelectorAll('.note-dropdown').forEach(d => {
                    d.classList.remove('active');
                });
            }
        };

        document.addEventListener('click', App.closeDropdownsHandler);
    }, 10);
}

async function saveNote() {
    const noteId = document.getElementById('noteEditId').value;
    const title = document.getElementById('noteTitleInput').value.trim();
    const datestamp = document.getElementById('noteDateInput').value;

    let content = '';
    if (App.noteEditor) {
        const rows = App.noteEditor.rows;
        content = rows.map(row =>
            row.map(cell => {
                let text = cell.char;
                if (cell.formatting.bold) text = `<b:${cell.formatting.bold}>${text}</b>`;
                if (cell.formatting.italic) text = `<i>${text}</i>`;
                if (cell.formatting.underline) text = `<u:${cell.formatting.underline}>${text}</u>`;
                if (cell.formatting.highlight) text = `<h:${cell.formatting.highlight}>${text}</h>`;
                if (cell.formatting.color) text = `<c:${cell.formatting.color}>${text}</c>`;
                return text;
            }).join('')
        ).join('\n').trim();
    }

    if (!content) {
        return App.showNotification('Note content cannot be empty', true);
    }

    if (!datestamp) {
        return App.showNotification('Please select a date', true);
    }

    const selectedDate = new Date(datestamp);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate > today) {
        return App.showNotification('Cannot select a future date', true);
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
    App.hideAllModals();
    renderNotes();
    App.showNotification(noteId ? 'Note updated!' : 'Note created!');

    App.noteEditorListenersSetup = false;
}

function generateNoteId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const index = App.state.notes.findIndex(n => n.id === noteId);
    if (index !== -1) {
        const deletedNote = App.state.notes[index];
        if (!App.state.notesRecycleBin) {
            App.state.notesRecycleBin = [];
        }
        App.state.notesRecycleBin.push(deletedNote);

        App.state.notes.splice(index, 1);
        saveNotesToLocalStorage();
        App.hideAllModals();
        renderNotes();
        App.showNotification('Note deleted.');
    }
}

function checkUnsavedChanges() {
    const noteId = document.getElementById('noteEditId').value;
    const title = document.getElementById('noteTitleInput').value.trim();
    const datestamp = document.getElementById('noteDateInput').value;
    const content = App.noteEditor ? App.noteEditor.getPlainText().trim() : '';

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
    updateLastSyncDisplay,
    loadNotes,
    renderNotes,
    stripFormatting,
    parseFormatting,
    viewNote,
    renderFormattedContent,
    editNote,
    setupNoteEditorEventListeners,
    saveNote,
    generateNoteId,
    deleteNote,
    checkUnsavedChanges
};