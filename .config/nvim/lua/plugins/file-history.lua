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

            M.config = {
                history_dir = vim.fn.expand('~/.nvim_local_history'),
                max_changes = 100,
                date_format = 'DD/MM',             -- 'DD/MM' or 'MM/DD'
                relative_time_threshold_days = 10,
                keybinds = {
                    pick = '<CR>',
                    close = '<C-c>',
                    close_alt = '<Esc>',
                    next_mode = 'm',
                    prev_mode = 'M',
                },
                ui = {
                    width_percent = 0.8,
                    height_percent = 0.8,
                    list_width = 40,
                },
                main_keybind = '<leader>fh',
            }

            function M.setup(opts)
                M.config = vim.tbl_extend('force', M.config, opts or {})
            end

            local function get_history_dir(filepath)
                local abs_path = vim.fn.fnamemodify(filepath, ':p')
                local file_dir = vim.fn.fnamemodify(abs_path, ':h')

                local path_without_slash = file_dir:gsub('^/', '')

                local history_dir = M.config.history_dir .. '/' .. path_without_slash
                return history_dir
            end

            local function get_history_filename(filepath)
                local filename = vim.fn.fnamemodify(filepath, ':t')
                local timestamp = os.date('%Y-%m-%d_%H-%M-%S')
                return filename .. '.' .. timestamp
            end

            local function ensure_dir_exists(dir)
                if vim.fn.isdirectory(dir) == 0 then
                    vim.fn.mkdir(dir, 'p')
                end
            end

            local function calculate_hash(lines)
                local content = table.concat(lines, '\n')
                return vim.fn.sha256(content)
            end

            local function get_history_files(filepath)
                local history_dir = get_history_dir(filepath)
                local filename = vim.fn.fnamemodify(filepath, ':t')

                if vim.fn.isdirectory(history_dir) == 0 then
                    return {}
                end

                local pattern = history_dir .. '/' .. filename .. '.*'
                local files = vim.fn.glob(pattern, false, true)

                table.sort(files, function(a, b)
                    return vim.fn.getftime(a) > vim.fn.getftime(b)
                end)

                return files
            end

            local function cleanup_old_history(filepath)
                local history_files = get_history_files(filepath)

                if #history_files > M.config.max_changes then
                    for i = M.config.max_changes + 1, #history_files do
                        vim.fn.delete(history_files[i])
                    end
                end
            end

            function M.save_history()
                local filepath = vim.fn.expand('%:p')

                -- Escape special pattern characters in history_dir for matching
                local history_dir_pattern = M.config.history_dir:gsub('([^%w])', '%%%1')
                if filepath == '' or
                    vim.bo.buftype ~= '' or
                    vim.fn.filereadable(filepath) == 0 or
                    filepath:match(history_dir_pattern) then
                    return
                end

                local current_lines = vim.fn.readfile(filepath)
                local current_hash = calculate_hash(current_lines)

                local history_files = get_history_files(filepath)
                if #history_files > 0 then
                    local latest_history = history_files[1]
                    local latest_lines = vim.fn.readfile(latest_history)
                    local latest_hash = calculate_hash(latest_lines)

                    if current_hash == latest_hash then
                        return
                    end
                end

                local history_dir = get_history_dir(filepath)
                local history_filename = get_history_filename(filepath)
                local history_path = history_dir .. '/' .. history_filename

                ensure_dir_exists(history_dir)

                vim.fn.writefile(current_lines, history_path)

                cleanup_old_history(filepath)
            end

            -- Returns: display_text, relative_start_pos (or nil if no relative time)
            local function format_time_display(timestamp_str)
                local year, month, day, hour, min, sec = timestamp_str:match(
                    '(%d%d%d%d)%-(%d%d)%-(%d%d)_(%d%d)%-(%d%d)%-(%d%d)')
                if not year then
                    return timestamp_str, nil
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

                local date_time
                if M.config.date_format == 'DD/MM' then
                    date_time = string.format('%02d/%02d %02d:%02d:%02d',
                        tonumber(day), tonumber(month), tonumber(hour), tonumber(min), tonumber(sec))
                else -- MM/DD
                    date_time = string.format('%02d/%02d %02d:%02d:%02d',
                        tonumber(month), tonumber(day), tonumber(hour), tonumber(min), tonumber(sec))
                end

                local threshold_seconds = M.config.relative_time_threshold_days * 86400
                if diff < threshold_seconds then
                    local relative
                    if diff < 10 then
                        relative = 'just now'
                    elseif diff < 60 then
                        local secs = math.floor(diff)
                        relative = secs .. ' second' .. (secs > 1 and 's' or '') .. ' ago'
                    elseif diff < 3600 then
                        local mins = math.floor(diff / 60)
                        relative = mins .. ' minute' .. (mins > 1 and 's' or '') .. ' ago'
                    elseif diff < 86400 then
                        local hours = math.floor(diff / 3600)
                        relative = hours .. ' hour' .. (hours > 1 and 's' or '') .. ' ago'
                    else
                        local days = math.floor(diff / 86400)
                        relative = days .. ' day' .. (days > 1 and 's' or '') .. ' ago'
                    end
                    local relative_start = #date_time + 1 -- +1 for the space
                    return date_time .. ' ' .. relative, relative_start
                else
                    return date_time, nil
                end
            end

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

                local orig_win = vim.api.nvim_get_current_win()

                local icon, icon_hl = devicons.get_icon(filename, vim.fn.fnamemodify(filename, ':e'), { default = true })
                local file_icon = icon or ''

                local ui = vim.api.nvim_list_uis()[1]

                local total_width = math.floor(ui.width * M.config.ui.width_percent)
                local total_height = math.floor(ui.height * M.config.ui.height_percent)
                local base_row = math.floor((ui.height - total_height) / 2)
                local base_col = math.floor((ui.width - total_width) / 2)

                local info_bar_height = 3
                local top_section_height = total_height - info_bar_height - 2 -- -2 for gap

                local history_width = M.config.ui.list_width
                local diff_width = total_width - history_width - 4 -- -4 for borders and gap

                local history_buf = vim.api.nvim_create_buf(false, true)
                vim.bo[history_buf].bufhidden = 'wipe'
                vim.bo[history_buf].filetype = 'filehistory'

                local history_lines = { 'Current' }
                local relative_time_positions = {}
                for i, file in ipairs(history_files) do
                    local timestamp = file:match('%.(%d%d%d%d%-%d%d%-%d%d_%d%d%-%d%d%-%d%d)$')
                    if timestamp then
                        local display, relative_start = format_time_display(timestamp)
                        table.insert(history_lines, display)
                        if relative_start then
                            table.insert(relative_time_positions, { line = i, start_col = relative_start })
                        end
                    else
                        table.insert(history_lines, file)
                    end
                end

                vim.api.nvim_buf_set_lines(history_buf, 0, -1, false, history_lines)
                vim.bo[history_buf].modifiable = false

                local history_ns_id = vim.api.nvim_create_namespace('file_history_relative_time')
                for _, pos in ipairs(relative_time_positions) do
                    local line_text = history_lines[pos.line + 1] -- +1 because "Current" is line 1
                    vim.api.nvim_buf_set_extmark(history_buf, history_ns_id, pos.line, pos.start_col, {
                        end_col = #line_text,
                        hl_group = 'Comment',
                    })
                end

                local selector_win = vim.api.nvim_open_win(history_buf, true, {
                    relative = 'editor',
                    width = history_width,
                    height = top_section_height,
                    row = base_row,
                    col = base_col,
                    style = 'minimal',
                    border = 'rounded',
                    title = ' 󰋚 History ',
                    title_pos = 'center',
                })

                local buf = history_buf

                local diff_buf = vim.api.nvim_create_buf(false, true)
                vim.bo[diff_buf].bufhidden = 'wipe'
                vim.bo[diff_buf].filetype = 'diff'

                local diff_win = vim.api.nvim_open_win(diff_buf, false, {
                    relative = 'editor',
                    width = diff_width,
                    height = top_section_height,
                    row = base_row,
                    col = base_col + history_width + 2, -- +2 for border
                    style = 'minimal',
                    border = 'rounded',
                    title = ' 󰊢 Diff ',
                    title_pos = 'center',
                })

                local info_buf = vim.api.nvim_create_buf(false, true)
                vim.bo[info_buf].bufhidden = 'wipe'
                vim.bo[info_buf].filetype = 'filehistory'

                local keybinds_text = M.config.keybinds.pick .. ': restore | ' ..
                    M.config.keybinds.next_mode .. ': mode | ' ..
                    M.config.keybinds.close .. ': close'

                local info_lines = {
                    '',
                    ' ' .. file_icon .. ' ' .. filename .. '    ' .. keybinds_text,
                    ''
                }

                vim.api.nvim_buf_set_lines(info_buf, 0, -1, false, info_lines)
                vim.bo[info_buf].modifiable = false

                local ns_id = vim.api.nvim_create_namespace('file_history_info')

                if icon_hl then
                    vim.api.nvim_buf_set_extmark(info_buf, ns_id, 1, 1, {
                        end_col = 1 + #file_icon,
                        hl_group = icon_hl,
                    })
                end

                local info_line = info_lines[2]
                local function highlight_key(key)
                    local search_start = #file_icon + #filename + 5 -- Start after filename
                    local key_start = info_line:find(key, search_start, true)
                    if key_start then
                        vim.api.nvim_buf_set_extmark(info_buf, ns_id, 1, key_start - 1, {
                            end_col = key_start - 1 + #key,
                            hl_group = 'Function',
                        })
                    end
                end

                highlight_key(M.config.keybinds.pick)
                highlight_key(M.config.keybinds.next_mode)
                highlight_key(M.config.keybinds.close)

                local keybinds_win = vim.api.nvim_open_win(info_buf, false, {
                    relative = 'editor',
                    width = total_width,
                    height = info_bar_height,
                    row = base_row + top_section_height + 2, -- +2 for border
                    col = base_col,
                    style = 'minimal',
                    border = 'rounded',
                })

                vim.api.nvim_set_current_win(selector_win)

                vim.wo[selector_win].cursorline = true
                local function_hl = vim.api.nvim_get_hl(0, { name = 'Function' })
                vim.api.nvim_set_hl(0, 'CursorLine', { fg = function_hl.fg, bold = true })

                vim.api.nvim_win_set_cursor(selector_win, { 1, 0 })

                local current_mode = 'diff_preceding'

                local function get_selected_index()
                    local line = vim.api.nvim_win_get_cursor(selector_win)[1]
                    -- Line 1 is "Current" (index 0), line 2+ are history files (index 1+)
                    local idx = line - 1
                    return idx <= #history_files and idx or nil
                end

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

                local function filter_diff_headers(diff_output)
                    local filtered_output = {}
                    for _, line in ipairs(diff_output) do
                        local is_chunk_header = line:match('^@@ %-')
                        if not (line:match('^%-%-%-') or line:match('^%+%+%+') or is_chunk_header) then
                            table.insert(filtered_output, line)
                        end
                    end
                    return filtered_output
                end

                local function show_view()
                    local idx = get_selected_index()
                    if not idx then return end

                    if not vim.api.nvim_win_is_valid(selector_win) or not vim.api.nvim_win_is_valid(diff_win) then
                        return
                    end

                    local view_content
                    local success, result = pcall(function()
                        if idx == 0 then
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            return vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)
                        else
                            local history_file = history_files[idx]
                            return vim.fn.readfile(history_file)
                        end
                    end)

                    if success then
                        view_content = result
                    else
                        view_content = { 'Error loading file: ' .. tostring(result) }
                    end

                    if not view_content or #view_content == 0 then
                        view_content = { '(empty file)' }
                    end

                    if vim.api.nvim_buf_is_valid(diff_buf) then
                        vim.bo[diff_buf].modifiable = true
                        local ft = vim.bo[vim.api.nvim_win_get_buf(orig_win)].filetype
                        vim.bo[diff_buf].filetype = ft
                        vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, view_content)
                        vim.bo[diff_buf].modifiable = false
                    end
                end

                local function show_diff_preceding()
                    local idx = get_selected_index()
                    if not idx then return end

                    if not vim.api.nvim_win_is_valid(selector_win) or not vim.api.nvim_win_is_valid(diff_win) then
                        return
                    end

                    local diff_output
                    local success, result = pcall(function()
                        if idx == 0 then
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            local current_content = vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)

                            local tmp_file = os.tmpname()
                            vim.fn.writefile(current_content, tmp_file)

                            local latest_history = history_files[1]
                            local cmd = string.format('diff -u %s %s',
                                vim.fn.shellescape(latest_history),
                                vim.fn.shellescape(tmp_file))
                            local output = vim.fn.systemlist(cmd)

                            vim.fn.delete(tmp_file)
                            return output
                        else
                            local current_history = history_files[idx]
                            local previous_history = history_files[idx + 1]

                            if not previous_history then
                                return { 'No preceding version available' }
                            else
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

                    if not diff_output or #diff_output == 0 then
                        diff_output = { 'No changes' }
                    end

                    diff_output = filter_diff_headers(diff_output)

                    if vim.api.nvim_buf_is_valid(diff_buf) then
                        vim.bo[diff_buf].modifiable = true
                        vim.bo[diff_buf].filetype = 'diff'
                        vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, diff_output)
                        vim.bo[diff_buf].modifiable = false
                    end
                end

                local function show_diff_current()
                    local idx = get_selected_index()
                    if not idx then return end

                    if not vim.api.nvim_win_is_valid(selector_win) or not vim.api.nvim_win_is_valid(diff_win) then
                        return
                    end

                    local diff_output
                    local success, result = pcall(function()
                        if idx == 0 then
                            return { 'No difference (this is the current version)' }
                        else
                            if not vim.api.nvim_win_is_valid(orig_win) then
                                return { 'Error: Original window no longer valid' }
                            end

                            local current_buf = vim.api.nvim_win_get_buf(orig_win)
                            local current_content = vim.api.nvim_buf_get_lines(current_buf, 0, -1, false)

                            local tmp_file = os.tmpname()
                            vim.fn.writefile(current_content, tmp_file)

                            local history_file = history_files[idx]
                            local cmd = string.format('diff -u %s %s',
                                vim.fn.shellescape(history_file),
                                vim.fn.shellescape(tmp_file))
                            local output = vim.fn.systemlist(cmd)

                            vim.fn.delete(tmp_file)
                            return output
                        end
                    end)

                    if success then
                        diff_output = result
                    else
                        diff_output = { 'Error generating diff: ' .. tostring(result) }
                    end

                    if not diff_output or #diff_output == 0 then
                        diff_output = { 'No changes' }
                    end

                    diff_output = filter_diff_headers(diff_output)

                    if vim.api.nvim_buf_is_valid(diff_buf) then
                        vim.bo[diff_buf].modifiable = true
                        vim.bo[diff_buf].filetype = 'diff'
                        vim.api.nvim_buf_set_lines(diff_buf, 0, -1, false, diff_output)
                        vim.bo[diff_buf].modifiable = false
                    end
                end

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

                local augroup = vim.api.nvim_create_augroup('FileHistoryPopup', { clear = true })

                vim.api.nvim_create_autocmd('CursorMoved', {
                    group = augroup,
                    buffer = buf,
                    callback = update_preview,
                })

                vim.api.nvim_create_autocmd('BufWipeout', {
                    group = augroup,
                    buffer = buf,
                    callback = function()
                        if vim.api.nvim_win_is_valid(keybinds_win) then
                            pcall(vim.api.nvim_win_close, keybinds_win, true)
                        end
                        if vim.api.nvim_win_is_valid(diff_win) then
                            pcall(vim.api.nvim_win_close, diff_win, true)
                        end
                        vim.api.nvim_del_augroup_by_id(augroup)
                    end,
                })

                vim.keymap.set('n', M.config.keybinds.pick, function()
                    local idx = get_selected_index()
                    if idx then
                        if idx == 0 then
                            vim.notify('Already viewing current version', vim.log.levels.INFO)
                            return
                        end
                        local file_content = vim.fn.readfile(history_files[idx])
                        vim.api.nvim_set_current_win(orig_win)
                        local current_buf = vim.api.nvim_win_get_buf(orig_win)
                        vim.api.nvim_buf_set_lines(current_buf, 0, -1, false, file_content)
                        vim.notify('Content replaced with selected version', vim.log.levels.INFO)
                        if vim.api.nvim_win_is_valid(keybinds_win) then
                            vim.api.nvim_win_close(keybinds_win, true)
                        end
                        if vim.api.nvim_win_is_valid(diff_win) then
                            vim.api.nvim_win_close(diff_win, true)
                        end
                        if vim.api.nvim_win_is_valid(selector_win) then
                            vim.api.nvim_win_close(selector_win, true)
                        end
                    end
                end, { buffer = buf, nowait = true })

                vim.keymap.set('n', M.config.keybinds.close, function()
                    if vim.api.nvim_win_is_valid(keybinds_win) then
                        pcall(vim.api.nvim_win_close, keybinds_win, true)
                    end
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                vim.keymap.set('n', M.config.keybinds.close_alt, function()
                    if vim.api.nvim_win_is_valid(keybinds_win) then
                        pcall(vim.api.nvim_win_close, keybinds_win, true)
                    end
                    if vim.api.nvim_win_is_valid(diff_win) then
                        pcall(vim.api.nvim_win_close, diff_win, true)
                    end
                    if vim.api.nvim_win_is_valid(selector_win) then
                        pcall(vim.api.nvim_win_close, selector_win, true)
                    end
                end, { buffer = buf, nowait = true })

                vim.keymap.set('n', M.config.keybinds.next_mode, function()
                    next_mode()
                end, { buffer = buf, nowait = true, desc = 'Next mode' })

                vim.keymap.set('n', M.config.keybinds.prev_mode, function()
                    prev_mode()
                end, { buffer = buf, nowait = true, desc = 'Previous mode' })

                vim.schedule(update_preview)
            end

            function M.init()
                local group = vim.api.nvim_create_augroup('FileHistory', { clear = true })

                vim.api.nvim_create_autocmd('BufWritePost', {
                    group = group,
                    pattern = '*',
                    callback = function()
                        M.save_history()
                    end,
                })

                vim.keymap.set('n', M.config.main_keybind, function()
                    M.browse_history()
                end, { desc = 'File history' })
            end

            M.init()
        end,
    }
}
