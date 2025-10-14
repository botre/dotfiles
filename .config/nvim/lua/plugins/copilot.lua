return {
    {
        'zbirenbaum/copilot.lua',
        cmd = 'Copilot',
        event = 'InsertEnter',
        config = function()
            require('copilot').setup({
                suggestion = {
                    auto_trigger = true,
                    trigger_on_accept = false,
                },
                keymap = {
                    accept = '<Tab>',
                },
            })
        end,
    },
}
