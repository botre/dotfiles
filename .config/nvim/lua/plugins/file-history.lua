return {
    {
        name = 'file-history',
        dir = vim.fn.stdpath('config'),
        dependencies = { 'nvim-telescope/telescope.nvim' },
        config = function()
            local M = {}

            -- Configuration
            M.config = {
                history_dir = '.local-history',
                max_changes = 100,
            }

            -- Setup function to allow configuration
            function M.setup(opts)
                M.config = vim.tbl_extend('force', M.config, opts or {})
            end

            -- Get the history directory for a file
            local function get_history_dir(filepath)
                -- Get the project root (or use current working directory)
                local project_root = vim.fn.getcwd()
                local history_base = vim.fn.expand(project_root .. '/' .. M.config.history_dir)

                -- Get the relative path of the file
                local relative_path = vim.fn.fnamemodify(filepath, ':.')
                local file_dir = vim.fn.fnamemodify(relative_path, ':h')

                -- Create the history directory path
                local history_dir = history_base .. '/' .. file_dir
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
                if filepath == '' or
                    vim.bo.buftype ~= '' or
                    vim.fn.filereadable(filepath) == 0 or
                    filepath:match(M.config.history_dir) then
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
                if diff < 60 then
                    return 'Just now'
                elseif diff < 3600 then
                    local mins = math.floor(diff / 60)
                    return mins .. ' minute' .. (mins > 1 and 's' or '') .. ' ago'
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

            -- Browse file history with Telescope
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

                -- Use Telescope to browse history files
                local pickers = require('telescope.pickers')
                local finders = require('telescope.finders')
                local conf = require('telescope.config').values
                local actions = require('telescope.actions')
                local action_state = require('telescope.actions.state')
                local previewers = require('telescope.previewers')

                pickers.new({}, {
                    prompt_title = 'File History: ' .. filename,
                    finder = finders.new_table({
                        results = history_files,
                        entry_maker = function(entry)
                            -- Extract timestamp from filename
                            local timestamp = entry:match('%.(%d%d%d%d%-%d%d%-%d%d_%d%d%-%d%d%-%d%d)$')
                            local display = timestamp and format_time_display(timestamp) or entry

                            return {
                                value = entry,
                                display = display,
                                ordinal = entry,
                                path = entry,
                            }
                        end,
                    }),
                    sorter = conf.generic_sorter({}),
                    previewer = previewers.new_buffer_previewer({
                        define_preview = function(self, entry)
                            local lines = vim.fn.readfile(entry.path)
                            vim.api.nvim_buf_set_lines(self.state.bufnr, 0, -1, false, lines)

                            -- Set filetype for syntax highlighting
                            local ft = vim.filetype.match({ filename = filepath })
                            if ft then
                                vim.api.nvim_buf_set_option(self.state.bufnr, 'filetype', ft)
                            end
                        end,
                    }),
                    attach_mappings = function(prompt_bufnr, map)
                        actions.select_default:replace(function()
                            actions.close(prompt_bufnr)
                            local selection = action_state.get_selected_entry()
                            M.diff_with_history(filepath, selection.path)
                        end)

                        -- Add a mapping to restore the historical version
                        map('n', '<C-r>', function()
                            actions.close(prompt_bufnr)
                            local selection = action_state.get_selected_entry()
                            M.restore_from_history(filepath, selection.path)
                        end)

                        return true
                    end,
                }):find()
            end

            -- Compare current file with a history version
            function M.diff_with_history(current_file, history_file)
                -- Open the history file in a vertical split with diff mode
                vim.cmd('vsplit ' .. vim.fn.fnameescape(history_file))
                vim.cmd('diffthis')
                vim.cmd('wincmd p')
                vim.cmd('diffthis')
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
