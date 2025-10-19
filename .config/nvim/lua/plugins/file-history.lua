return {
    {
        name = 'file-history',
        dir = vim.fn.stdpath('config'),
        config = function()
            local M = {}

            -- Configuration
            M.config = {
                history_dir = vim.fn.expand('~/.nvim_local_ ==history'),
                max_changes = 100,
                keybinds = {
                    pick = '<CR>',
                    close = 'q',
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

            -- Browse file history in a side panel
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

                -- Create a new buffer for the history list
                local buf = vim.api.nvim_create_buf(false, true)
                vim.api.nvim_buf_set_option(buf, 'bufhidden', 'wipe')
                vim.api.nvim_buf_set_option(buf, 'filetype', 'filehistory')

                -- Build the display lines with dynamic keybindings
                local kb = M.config.keybinds
                local lines = {
                    'File History: ' .. filename,
                    '',
                    'Keybindings:',
                    string.format('  %-6s - Pick this version', kb.pick),
                    string.format('  %-6s - Close panels', kb.close),
                    '',
                    '───────────────────────────────────────',
                    ''
                }
                for i, file in ipairs(history_files) do
                    local timestamp = file:match('%.(%d%d%d%d%-%d%d%-%d%d_%d%d%-%d%d%-%d%d)$')
                    local display = timestamp and format_time_display(timestamp) or file
                    table.insert(lines, string.format('%d. %s', i, display))
                end

                vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
                vim.api.nvim_buf_set_option(buf, 'modifiable', false)

                -- Open in a vertical split on the left
                vim.cmd('vertical topleft split')
                local selector_win = vim.api.nvim_get_current_win()
                vim.api.nvim_win_set_buf(selector_win, buf)
                vim.api.nvim_win_set_width(selector_win, 40)

                -- Create diff preview buffer
                local diff_buf = vim.api.nvim_create_buf(false, true)
                vim.api.nvim_buf_set_option(diff_buf, 'bufhidden', 'wipe')
                vim.api.nvim_buf_set_option(diff_buf, 'filetype', 'diff')

                -- Open diff buffer in a split next to selector
                vim.cmd('wincmd l')
                vim.cmd('vertical topleft split')
                local diff_win = vim.api.nvim_get_current_win()
                vim.api.nvim_win_set_buf(diff_win, diff_buf)

                -- Go back to selector window
                vim.api.nvim_set_current_win(selector_win)

                -- Set up keybindings for the history buffer
                local function get_selected_index()
                    local line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    -- Skip header lines (8 lines: title, empty, keybindings x3, empty, separator, empty)
                    if line <= 8 then return nil end
                    local idx = line - 8
                    return idx <= #history_files and idx or nil
                end

                -- Function to show diff in preview panel
                local function show_diff()
                    local idx = get_selected_index()
                    if not idx then return end

                    local current_history = history_files[idx]
                    local previous_history = history_files[idx + 1]

                    -- Generate diff
                    local diff_output
                    if not previous_history then
                        -- Compare with current file
                        local cmd = string.format('diff -u %s %s',
                            vim.fn.shellescape(current_history),
                            vim.fn.shellescape(filepath))
                        diff_output = vim.fn.systemlist(cmd)
                    else
                        -- Compare with previous history entry
                        local cmd = string.format('diff -u %s %s',
                            vim.fn.shellescape(previous_history),
                            vim.fn.shellescape(current_history))
                        diff_output = vim.fn.systemlist(cmd)
                    end

                    -- Update diff buffer
                    vim.api.nvim_buf_set_option(diff_buf, 'modifiable', true)
                    vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, diff_output)
                    vim.api.nvim_buf_set_option(diff_buf, 'modifiable', false)
                end

                -- Automatically update diff on cursor move
                vim.api.nvim_create_autocmd('CursorMoved', {
                    buffer = buf,
                    callback = show_diff,
                })

                -- Pick (restore) from history
                vim.keymap.set('n', kb.pick, function()
                    local idx = get_selected_index()
                    if idx then
                        local lines = vim.fn.readfile(history_files[idx])
                        vim.api.nvim_set_current_win(orig_win)
                        local current_buf = vim.api.nvim_win_get_buf(orig_win)
                        vim.api.nvim_buf_set_lines(current_buf, 0, -1, false, lines)
                        vim.notify('Content replaced with selected version', vim.log.levels.INFO)
                    end
                end, { buffer = buf, nowait = true })

                -- Close the panels
                vim.keymap.set('n', kb.close, function()
                    if vim.api.nvim_win_is_valid(diff_win) then
                        vim.api.nvim_win_close(diff_win, true)
                    end
                    vim.cmd('close')
                end, { buffer = buf, nowait = true })

                -- Show initial diff
                vim.schedule(show_diff)
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
