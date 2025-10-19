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
                    close_alt = '<Esc>',
                    next_mode = 'm',
                    prev_mode = 'M',
                    next = 'j',
                    prev = 'k',
                    first = 'gg',
                    last = 'G',
                },
                ui = {
                    width_percent = 0.8,
                    height_percent = 0.8,
                    list_width = 40,
                },
                main_keybind = '<leader>fh',
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

                -- Get file icon and highlight for the current file
                local icon, icon_hl = devicons.get_icon(filename, vim.fn.fnamemodify(filename, ':e'), { default = true })
                local file_icon = icon or ''

                -- Calculate popup dimensions
                local ui = vim.api.nvim_list_uis()[1]
                local width = math.floor(ui.width * M.config.ui.width_percent)
                local height = math.floor(ui.height * M.config.ui.height_percent)
                local list_width = M.config.ui.list_width
                local diff_width = width - list_width - 3 -- 3 for borders

                -- Header takes 4 lines (filename, empty, separator, keybinds)
                local header_height = 4
                local selector_height = height - header_height

                local base_row = math.floor((ui.height - height) / 2)
                local base_col = math.floor((ui.width - width) / 2)

                -- Create header buffer
                local header_buf = vim.api.nvim_create_buf(false, true)
                vim.bo[header_buf].bufhidden = 'wipe'
                vim.bo[header_buf].filetype = 'filehistory'

                -- Build header lines
                local header_lines = {
                    file_icon .. ' ' .. filename,
                    '',
                    '───────────────────────────────────',
                    M.config.keybinds.next_mode .. '/' .. M.config.keybinds.prev_mode .. ': mode | ' ..
                    M.config.keybinds.pick .. ': restore | ' ..
                    M.config.keybinds.close .. ': close'
                }

                vim.api.nvim_buf_set_lines(header_buf, 0, -1, false, header_lines)
                vim.bo[header_buf].modifiable = false

                -- Add highlighting to keybindings
                local ns_id = vim.api.nvim_create_namespace('file_history_keybinds')
                local keybinds_text = header_lines[4]

                -- Highlight the keybind letters
                local function highlight_key(key, start_pos)
                    local key_start = keybinds_text:find(vim.pesc(key), start_pos, true)
                    if key_start then
                        vim.api.nvim_buf_add_highlight(header_buf, ns_id, 'Function', 3, key_start - 1,
                            key_start - 1 + #key)
                        return key_start + #key
                    end
                    return start_pos
                end

                local pos = 1
                pos = highlight_key(M.config.keybinds.next_mode, pos)
                pos = highlight_key(M.config.keybinds.prev_mode, pos)
                pos = highlight_key(M.config.keybinds.pick, pos)
                highlight_key(M.config.keybinds.close, pos)

                -- Apply color to the file icon
                if icon_hl then
                    vim.api.nvim_buf_add_highlight(header_buf, ns_id, icon_hl, 0, 0, #file_icon)
                end

                -- Create floating window for header (no border)
                local header_win = vim.api.nvim_open_win(header_buf, false, {
                    relative = 'editor',
                    width = list_width,
                    height = header_height,
                    row = base_row,
                    col = base_col,
                    style = 'minimal',
                    border = 'none',
                })

                -- Create selector buffer for history list
                local buf = vim.api.nvim_create_buf(false, true)
                vim.bo[buf].bufhidden = 'wipe'
                vim.bo[buf].filetype = 'filehistory'

                -- Build the selector lines (just history items)
                local lines = { 'Current' }
                for _, file in ipairs(history_files) do
                    local timestamp = file:match('%.(%d%d%d%d%-%d%d%-%d%d_%d%d%-%d%d%-%d%d)$')
                    local display = timestamp and format_time_display(timestamp) or file
                    table.insert(lines, display)
                end

                vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
                vim.bo[buf].modifiable = false

                -- Create floating window for history list
                local selector_win = vim.api.nvim_open_win(buf, true, {
                    relative = 'editor',
                    width = list_width,
                    height = selector_height,
                    row = base_row + header_height,
                    col = base_col,
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
                -- Use Function highlight style for consistency with keybindings
                local function_hl = vim.api.nvim_get_hl(0, { name = 'Function' })
                vim.api.nvim_set_hl(0, 'CursorLine', { fg = function_hl.fg, bold = true })

                -- Set cursor to "Current" line (line 1)
                vim.api.nvim_win_set_cursor(selector_win, { 1, 0 })

                -- Track current mode (view, diff_preceding, or diff_current)
                local current_mode = 'diff_preceding'

                -- Set up keybindings for the history buffer
                local function get_selected_index()
                    local line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    -- Line 1 is "Current" (index 0), line 2+ are history files (index 1+)
                    local idx = line - 1
                    -- idx 0 = Current, idx 1+ = history_files[idx]
                    return idx <= #history_files and idx or nil
                end

                -- Function to update the preview window title
                local function update_preview_title()
                    if vim.api.nvim_win_is_valid(diff_win) then
                        local title
                        if current_mode == 'view' then
                            title = ' 󰈔 View '
                        elseif current_mode == 'diff_preceding' then
                            title = ' 󰊢 Diff Preceding '
                        else -- diff_current
                            title = ' 󰊢 Diff Current '
                        end
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

                -- Function to show diff against preceding version
                local function show_diff_preceding()
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
                            -- Regular history entry: compare with previous history
                            local current_history = history_files[idx]
                            local previous_history = history_files[idx + 1]

                            if not previous_history then
                                -- This is the oldest history entry - no preceding version
                                return { 'No preceding version available' }
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

                -- Function to show diff against current file state
                local function show_diff_current()
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
                            -- "Current" entry: no diff needed, it's the same as current
                            return { 'No difference (this is the current version)' }
                        else
                            -- History entry: compare with current file state
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            local current_content = vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)

                            -- Write current buffer to a temporary file
                            local tmp_file = os.tmpname()
                            vim.fn.writefile(current_content, tmp_file)

                            -- Compare history file with current state
                            local history_file = history_files[idx]
                            local cmd = string.format('diff -u %s %s',
                                vim.fn.shellescape(history_file),
                                vim.fn.shellescape(tmp_file))
                            local output = vim.fn.systemlist(cmd)

                            -- Clean up temp file
                            vim.fn.delete(tmp_file)
                            return output
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
                    elseif current_mode == 'diff_preceding' then
                        show_diff_preceding()
                    else -- diff_current
                        show_diff_current()
                    end
                    update_preview_title()
                end

                -- Function to go to next mode
                local function next_mode()
                    if current_mode == 'view' then
                        current_mode = 'diff_preceding'
                    elseif current_mode == 'diff_preceding' then
                        current_mode = 'diff_current'
                    else -- diff_current
                        current_mode = 'view'
                    end
                    update_preview()
                end

                -- Function to go to previous mode
                local function prev_mode()
                    if current_mode == 'view' then
                        current_mode = 'diff_current'
                    elseif current_mode == 'diff_current' then
                        current_mode = 'diff_preceding'
                    else -- diff_preceding
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
                        if vim.api.nvim_win_is_valid(header_win) then
                            pcall(vim.api.nvim_win_close, header_win, true)
                        end
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
                        local file_content = vim.fn.readfile(history_files[idx])
                        vim.api.nvim_set_current_win(orig_win)
                        local current_buf = vim.api.nvim_win_get_buf(orig_win)
                        vim.api.nvim_buf_set_lines(current_buf, 0, -1, false, file_content)
                        vim.notify('Content replaced with selected version', vim.log.levels.INFO)
                        -- Close the panels
                        if vim.api.nvim_win_is_valid(header_win) then
                            vim.api.nvim_win_close(header_win, true)
                        end
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
                    if vim.api.nvim_win_is_valid(header_win) then
                        pcall(vim.api.nvim_win_close, header_win, true)
                    end
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                -- Also close on alternate close key
                vim.keymap.set('n', M.config.keybinds.close_alt, function()
                    if vim.api.nvim_win_is_valid(header_win) then
                        pcall(vim.api.nvim_win_close, header_win, true)
                    end
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                -- Switch to next mode
                vim.keymap.set('n', M.config.keybinds.next_mode, function()
                    next_mode()
                end, { buffer = buf, nowait = true, desc = 'Next mode' })

                -- Switch to previous mode
                vim.keymap.set('n', M.config.keybinds.prev_mode, function()
                    prev_mode()
                end, { buffer = buf, nowait = true, desc = 'Previous mode' })

                -- Cycle through history items
                vim.keymap.set('n', M.config.keybinds.next, function()
                    local current_line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    local first_line = 1                 -- "Current" entry
                    local last_line = 1 + #history_files -- Last history entry

                    if current_line >= last_line then
                        -- Wrap to first line
                        vim.api.nvim_win_set_cursor(selector_win, { first_line, 0 })
                    else
                        -- Move down
                        vim.api.nvim_win_set_cursor(selector_win, { current_line + 1, 0 })
                    end
                end, { buffer = buf, nowait = true })

                vim.keymap.set('n', M.config.keybinds.prev, function()
                    local current_line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    local first_line = 1                 -- "Current" entry
                    local last_line = 1 + #history_files -- Last history entry

                    if current_line <= first_line then
                        -- Wrap to last line
                        vim.api.nvim_win_set_cursor(selector_win, { last_line, 0 })
                    else
                        -- Move up
                        vim.api.nvim_win_set_cursor(selector_win, { current_line - 1, 0 })
                    end
                end, { buffer = buf, nowait = true })

                -- Jump to first item
                vim.keymap.set('n', M.config.keybinds.first, function()
                    local first_line = 1 -- "Current" entry
                    vim.api.nvim_win_set_cursor(selector_win, { first_line, 0 })
                end, { buffer = buf, nowait = true })

                -- Jump to last item
                vim.keymap.set('n', M.config.keybinds.last, function()
                    local last_line = 1 + #history_files -- Last history entry
                    vim.api.nvim_win_set_cursor(selector_win, { last_line, 0 })
                end, { buffer = buf, nowait = true })

                -- Show initial view
                vim.schedule(update_preview)
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
                vim.keymap.set('n', M.config.main_keybind, function()
                    M.browse_history()
                end, { desc = 'Browse file history' })
            end

            -- Initialize the plugin
            M.init()
        end,
    }
}
