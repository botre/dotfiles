return {
    {
        name = 'file-history',
        dir = vim.fn.stdpath('config'),
        dependencies = {
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            local M = {}
            local devicons = require('nvim-web-devicons')

            -- Configuration
            M.config = {
                history_dir = vim.fn.expand('~/.nvim_local_history'),
                max_changes = 100,
                keybinds = {
                    pick = '<CR>',
                    close = 'q',
                    toggle_mode = 'm',
                },
            }

            -- Setup function to allow configuration
            function M.setup(opts)
                M.config = vim.tbl_extend('force', M.config, opts or {})
            end

            -- Get the history directory for a file
            local function get_history_dir(filepath)
                -- Get the absolute path and extract directory
                local abs_path = vim.fn.fnamemodify(filepath, ':p')
                local file_dir = vim.fn.fnamemodify(abs_path, ':h')

                -- Remove leading slash to create relative path structure
                -- e.g., /home/user/file.txt -> home/user
                local path_without_slash = file_dir:gsub('^/', '')

                -- Create centralized history directory based on full file path
                local history_dir = M.config.history_dir .. '/' .. path_without_slash
                return history_dir
            end

            -- Get the filename for a history entry
            local function get_history_filename(filepath)
                local filename = vim.fn.fnamemodify(filepath, ':t')
                local timestamp = os.date('%Y-%m-%d_%H-%M-%S')
                return filename .. '.' .. timestamp
            end

            -- Ensure directory exists
            local function ensure_dir_exists(dir)
                if vim.fn.isdirectory(dir) == 0 then
                    vim.fn.mkdir(dir, 'p')
                end
            end

            -- Calculate SHA256 hash of file contents
            local function calculate_hash(lines)
                local content = table.concat(lines, '\n')
                -- Use vim's built-in sha256 function
                return vim.fn.sha256(content)
            end

            -- Get all history files for a given file
            local function get_history_files(filepath)
                local history_dir = get_history_dir(filepath)
                local filename = vim.fn.fnamemodify(filepath, ':t')

                if vim.fn.isdirectory(history_dir) == 0 then
                    return {}
                end

                local pattern = history_dir .. '/' .. filename .. '.*'
                local files = vim.fn.glob(pattern, false, true)

                -- Sort by modification time (newest first)
                table.sort(files, function(a, b)
                    return vim.fn.getftime(a) > vim.fn.getftime(b)
                end)

                return files
            end

            -- Remove oldest history files if exceeding max_changes
            local function cleanup_old_history(filepath)
                local history_files = get_history_files(filepath)

                if #history_files >= M.config.max_changes then
                    -- Remove oldest files
                    for i = M.config.max_changes, #history_files do
                        vim.fn.delete(history_files[i])
                    end
                end
            end

            -- Save the current file to history
            function M.save_history()
                local filepath = vim.fn.expand('%:p')

                -- Don't save history for certain file types or paths
                -- Escape special pattern characters in history_dir for matching
                local history_dir_pattern = M.config.history_dir:gsub('([^%w])', '%%%1')
                if filepath == '' or
                    vim.bo.buftype ~= '' or
                    vim.fn.filereadable(filepath) == 0 or
                    filepath:match(history_dir_pattern) then
                    return
                end

                -- Read current file contents
                local current_lines = vim.fn.readfile(filepath)
                local current_hash = calculate_hash(current_lines)

                -- Check if content has changed compared to the latest history entry
                local history_files = get_history_files(filepath)
                if #history_files > 0 then
                    local latest_history = history_files[1]
                    local latest_lines = vim.fn.readfile(latest_history)
                    local latest_hash = calculate_hash(latest_lines)

                    -- Skip saving if content hasn't changed
                    if current_hash == latest_hash then
                        return
                    end
                end

                local history_dir = get_history_dir(filepath)
                local history_filename = get_history_filename(filepath)
                local history_path = history_dir .. '/' .. history_filename

                -- Ensure history directory exists
                ensure_dir_exists(history_dir)

                -- Copy the file to history
                vim.fn.writefile(current_lines, history_path)

                -- Cleanup old history
                cleanup_old_history(filepath)
            end

            -- Format time in a human-readable way
            local function format_time_display(timestamp_str)
                -- Parse the timestamp (format: YYYY-MM-DD_HH-MM-SS)
                local year, month, day, hour, min, sec = timestamp_str:match(
                    '(%d%d%d%d)%-(%d%d)%-(%d%d)_(%d%d)%-(%d%d)%-(%d%d)')
                if not year then
                    return timestamp_str
                end

                local time = os.time({
                    year = tonumber(year),
                    month = tonumber(month),
                    day = tonumber(day),
                    hour = tonumber(hour),
                    min = tonumber(min),
                    sec = tonumber(sec)
                })

                local now = os.time()
                local diff = now - time

                -- Show relative time for recent changes
                if diff < 10 then
                    return 'Just now'
                elseif diff < 60 then
                    local secs = math.floor(diff)
                    return secs .. ' second' .. (secs > 1 and 's' or '') .. ' ago'
                elseif diff < 3600 then
                    local mins = math.floor(diff / 60)
                    local secs = math.floor(diff % 60)
                    return mins .. ' min ' .. secs .. ' sec ago'
                elseif diff < 86400 then
                    local hours = math.floor(diff / 3600)
                    return hours .. ' hour' .. (hours > 1 and 's' or '') .. ' ago'
                elseif diff < 604800 then
                    local days = math.floor(diff / 86400)
                    return days .. ' day' .. (days > 1 and 's' or '') .. ' ago'
                else
                    -- For older entries, show a clean date format
                    return os.date('%b %d, %Y at %H:%M', time)
                end
            end

            -- Browse file history in a popup panel
            function M.browse_history()
                local filepath = vim.fn.expand('%:p')
                local filename = vim.fn.fnamemodify(filepath, ':t')

                if filepath == '' then
                    vim.notify('No file in current buffer', vim.log.levels.WARN)
                    return
                end

                local history_files = get_history_files(filepath)

                if #history_files == 0 then
                    vim.notify('No history found for ' .. filename, vim.log.levels.INFO)
                    return
                end

                -- Store the original window
                local orig_win = vim.api.nvim_get_current_win()

                -- Get file icon for the current file
                local icon, icon_hl = devicons.get_icon(filename, vim.fn.fnamemodify(filename, ':e'), { default = true })
                local file_icon = icon or ''

                -- Create a new buffer for the history list
                local buf = vim.api.nvim_create_buf(false, true)
                vim.bo[buf].bufhidden = 'wipe'
                vim.bo[buf].filetype = 'filehistory'

                -- Build the display lines
                local lines = {
                    file_icon .. ' ' .. filename,
                    ''
                }
                -- Add virtual "Current" entry at the top
                table.insert(lines, 'Current')
                for i, file in ipairs(history_files) do
                    local timestamp = file:match('%.(%d%d%d%d%-%d%d%-%d%d_%d%d%-%d%d%-%d%d)$')
                    local display = timestamp and format_time_display(timestamp) or file
                    table.insert(lines, display)
                end

                -- Add footer with keybindings
                table.insert(lines, '')
                table.insert(lines, '───────────────────────────────────')
                table.insert(lines, M.config.keybinds.toggle_mode .. ': mode | ' ..
                    M.config.keybinds.pick .. ': restore | ' ..
                    M.config.keybinds.close .. ': close')

                vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
                vim.bo[buf].modifiable = false

                -- Calculate popup dimensions
                local ui = vim.api.nvim_list_uis()[1]
                local width = math.floor(ui.width * 0.8)
                local height = math.floor(ui.height * 0.8)
                local list_width = 40
                local diff_width = width - list_width - 3 -- 3 for borders

                -- Create floating window for history list
                local selector_win = vim.api.nvim_open_win(buf, true, {
                    relative = 'editor',
                    width = list_width,
                    height = height,
                    row = math.floor((ui.height - height) / 2),
                    col = math.floor((ui.width - width) / 2),
                    style = 'minimal',
                    border = 'rounded',
                    title = ' 󰋚 History ',
                    title_pos = 'center',
                })

                -- Create diff preview buffer
                local diff_buf = vim.api.nvim_create_buf(false, true)
                vim.bo[diff_buf].bufhidden = 'wipe'
                vim.bo[diff_buf].filetype = 'diff'

                -- Create floating window for diff preview
                local diff_win = vim.api.nvim_open_win(diff_buf, false, {
                    relative = 'editor',
                    width = diff_width,
                    height = height,
                    row = math.floor((ui.height - height) / 2),
                    col = math.floor((ui.width - width) / 2) + list_width + 1,
                    style = 'minimal',
                    border = 'rounded',
                    title = ' 󰊢 Diff ',
                    title_pos = 'center',
                })

                -- Focus selector window
                vim.api.nvim_set_current_win(selector_win)

                -- Enable cursorline for better visibility
                vim.wo[selector_win].cursorline = true

                -- Set cursor to "Current" line (line 3)
                vim.api.nvim_win_set_cursor(selector_win, { 3, 0 })

                -- Track current mode (view or diff)
                local current_mode = 'diff'

                -- Set up keybindings for the history buffer
                local function get_selected_index()
                    local line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    -- Skip header lines (2 lines: title, empty)
                    if line <= 2 then return nil end
                    -- Line 3 is "Current" (index 0), line 4+ are history files (index 1+)
                    local idx = line - 3
                    -- idx 0 = Current, idx 1+ = history_files[idx]
                    return idx <= #history_files and idx or nil
                end

                -- Function to update the preview window title
                local function update_preview_title()
                    if vim.api.nvim_win_is_valid(diff_win) then
                        local title = current_mode == 'view' and ' 󰈔 View ' or ' 󰊢 Diff '
                        vim.api.nvim_win_set_config(diff_win, {
                            title = title,
                            title_pos = 'center',
                        })
                    end
                end

                -- Function to show file content in view mode
                local function show_view()
                    local idx = get_selected_index()
                    if not idx then return end

                    -- Check if windows are still valid
                    if not vim.api.nvim_win_is_valid(selector_win) or not vim.api.nvim_win_is_valid(diff_win) then
                        return
                    end

                    local view_content
                    local success, result = pcall(function()
                        if idx == 0 then
                            -- "Current" entry: show current buffer content
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            return vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)
                        else
                            -- Show history file content
                            local history_file = history_files[idx]
                            return vim.fn.readfile(history_file)
                        end
                    end)

                    if success then
                        view_content = result
                    else
                        view_content = { 'Error loading file: ' .. tostring(result) }
                    end

                    -- Handle empty content
                    if not view_content or #view_content == 0 then
                        view_content = { '(empty file)' }
                    end

                    -- Update diff buffer with file content
                    if vim.api.nvim_buf_is_valid(diff_buf) then
                        vim.bo[diff_buf].modifiable = true
                        -- Set filetype to match original file for syntax highlighting
                        local ft = vim.bo[vim.api.nvim_win_get_buf(orig_win)].filetype
                        vim.bo[diff_buf].filetype = ft
                        vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, view_content)
                        vim.bo[diff_buf].modifiable = false
                    end
                end

                -- Function to show diff in preview panel
                local function show_diff()
                    local idx = get_selected_index()
                    if not idx then return end

                    -- Check if windows are still valid
                    if not vim.api.nvim_win_is_valid(selector_win) or not vim.api.nvim_win_is_valid(diff_win) then
                        return
                    end

                    -- Generate diff
                    local diff_output
                    local success, result = pcall(function()
                        if idx == 0 then
                            -- "Current" entry: compare current buffer with latest saved history
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            local current_content = vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)

                            -- Write current buffer to a temporary file
                            local tmp_file = os.tmpname()
                            vim.fn.writefile(current_content, tmp_file)

                            -- Compare with the most recent history file
                            local latest_history = history_files[1]
                            local cmd = string.format('diff -u %s %s',
                                vim.fn.shellescape(latest_history),
                                vim.fn.shellescape(tmp_file))
                            local output = vim.fn.systemlist(cmd)

                            -- Clean up temp file
                            vim.fn.delete(tmp_file)
                            return output
                        else
                            -- Regular history entry
                            local current_history = history_files[idx]
                            local previous_history = history_files[idx + 1]

                            if not previous_history then
                                -- Compare with current file
                                local cmd = string.format('diff -u %s %s',
                                    vim.fn.shellescape(current_history),
                                    vim.fn.shellescape(filepath))
                                return vim.fn.systemlist(cmd)
                            else
                                -- Compare with previous history entry
                                local cmd = string.format('diff -u %s %s',
                                    vim.fn.shellescape(previous_history),
                                    vim.fn.shellescape(current_history))
                                return vim.fn.systemlist(cmd)
                            end
                        end
                    end)

                    if success then
                        diff_output = result
                    else
                        diff_output = { 'Error generating diff: ' .. tostring(result) }
                    end

                    -- Handle empty diff
                    if not diff_output or #diff_output == 0 then
                        diff_output = { 'No changes' }
                    end

                    -- Update diff buffer
                    if vim.api.nvim_buf_is_valid(diff_buf) then
                        vim.bo[diff_buf].modifiable = true
                        -- Set filetype to diff for syntax highlighting
                        vim.bo[diff_buf].filetype = 'diff'
                        vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, diff_output)
                        vim.bo[diff_buf].modifiable = false
                    end
                end

                -- Function to update preview based on current mode
                local function update_preview()
                    if current_mode == 'view' then
                        show_view()
                    else
                        show_diff()
                    end
                    update_preview_title()
                end

                -- Function to toggle between view and diff modes
                local function toggle_mode()
                    if current_mode == 'view' then
                        current_mode = 'diff'
                    else
                        current_mode = 'view'
                    end
                    update_preview()
                end

                -- Create autocmd group for cleanup
                local augroup = vim.api.nvim_create_augroup('FileHistoryPopup', { clear = true })

                -- Automatically update preview on cursor move
                vim.api.nvim_create_autocmd('CursorMoved', {
                    group = augroup,
                    buffer = buf,
                    callback = update_preview,
                })

                -- Cleanup when buffer is closed
                vim.api.nvim_create_autocmd('BufWipeout', {
                    group = augroup,
                    buffer = buf,
                    callback = function()
                        if vim.api.nvim_win_is_valid(diff_win) then
                            pcall(vim.api.nvim_win_close, diff_win, true)
                        end
                        vim.api.nvim_del_augroup_by_id(augroup)
                    end,
                })

                -- Pick (restore) from history
                vim.keymap.set('n', M.config.keybinds.pick, function()
                    local idx = get_selected_index()
                    if idx then
                        if idx == 0 then
                            -- "Current" entry - no need to restore
                            vim.notify('Already viewing current version', vim.log.levels.INFO)
                            return
                        end
                        local lines = vim.fn.readfile(history_files[idx])
                        vim.api.nvim_set_current_win(orig_win)
                        local current_buf = vim.api.nvim_win_get_buf(orig_win)
                        vim.api.nvim_buf_set_lines(current_buf, 0, -1, false, lines)
                        vim.notify('Content replaced with selected version', vim.log.levels.INFO)
                        -- Close the panels
                        if vim.api.nvim_win_is_valid(diff_win) then
                            vim.api.nvim_win_close(diff_win, true)
                        end
                        if vim.api.nvim_win_is_valid(selector_win) then
                            vim.api.nvim_win_close(selector_win, true)
                        end
                    end
                end, { buffer = buf, nowait = true })

                -- Close the popup panels
                vim.keymap.set('n', M.config.keybinds.close, function()
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                -- Also close on <Esc>
                vim.keymap.set('n', '<Esc>', function()
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                -- Toggle between view and diff mode
                vim.keymap.set('n', M.config.keybinds.toggle_mode, function()
                    toggle_mode()
                end, { buffer = buf, nowait = true, desc = 'Toggle view/diff mode' })

                -- Show initial view
                vim.schedule(update_preview)
            end

            -- Compare a history entry with the previous (older) entry
            function M.diff_with_previous(history_files, current_history, filepath)
                -- Find the index of the current history file
                local current_idx = nil
                for i, file in ipairs(history_files) do
                    if file == current_history then
                        current_idx = i
                        break
                    end
                end

                if not current_idx then
                    vim.notify('Could not find history entry', vim.log.levels.ERROR)
                    return
                end

                -- Get the previous (older) history file
                local previous_history = history_files[current_idx + 1]

                if not previous_history then
                    -- This is the oldest entry, compare with current file
                    vim.cmd('edit ' .. vim.fn.fnameescape(filepath))
                    vim.cmd('diffthis')
                    vim.cmd('vsplit ' .. vim.fn.fnameescape(current_history))
                    vim.cmd('diffthis')
                    vim.notify('Comparing with current file (no older history)', vim.log.levels.INFO)
                else
                    -- Compare with previous history entry
                    vim.cmd('edit ' .. vim.fn.fnameescape(previous_history))
                    vim.cmd('diffthis')
                    vim.cmd('vsplit ' .. vim.fn.fnameescape(current_history))
                    vim.cmd('diffthis')
                end
            end

            -- Restore a file from history
            function M.restore_from_history(current_file, history_file)
                local choice = vim.fn.confirm(
                    'Restore this version? Current file will be overwritten.',
                    '&Yes\n&No',
                    2
                )

                if choice == 1 then
                    local lines = vim.fn.readfile(history_file)
                    local current_buf = vim.fn.bufnr('%')
                    vim.api.nvim_buf_set_lines(current_buf, 0, -1, false, lines)
                    vim.cmd('write')
                    vim.notify('File restored from history', vim.log.levels.INFO)
                end
            end

            -- Setup autocmd to save history on file save
            function M.init()
                local group = vim.api.nvim_create_augroup('FileHistory', { clear = true })

                vim.api.nvim_create_autocmd('BufWritePost', {
                    group = group,
                    pattern = '*',
                    callback = function()
                        M.save_history()
                    end,
                })

                -- Setup keybinding
                vim.keymap.set('n', '<leader>fh', function()
                    M.browse_history()
                end, { desc = 'Browse file history' })
            end

            -- Initialize the plugin
            M.init()
        end,
    }
}
