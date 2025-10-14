return {
    {
        'zbirenbaum/copilot.lua',
        cmd = 'Copilot',
        event = 'InsertEnter',
        config = function()
            require('copilot').setup({
                panel = {
                    enabled = false
                },
                suggestion = {
                    accept = false,
                    auto_trigger = true,
                    trigger_on_accept = false,
                },
            })

            -- Super tab mapping: accept Copilot suggestion with Tab, fallback to normal Tab
            vim.keymap.set('i', '<Tab>', function()
                if require('copilot.suggestion').is_visible() then
                    require('copilot.suggestion').accept()
                else
                    vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('<Tab>', true, false, true), 'n', false)
                end
            end, {
                silent = true,
            })
        end,
    },
}
