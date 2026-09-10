return {
    {
        'catppuccin/nvim',
        name = 'catppuccin',
        priority = 1000,
        config = function()
            require('catppuccin').setup({
                flavour = 'latte',
                -- Detects which plugins are installed and enables their
                -- integrations, so this file never drifts from plugins/.
                auto_integrations = true,
            })
            vim.cmd.colorscheme('catppuccin')
        end,
    },
    {
        'nvim-tree/nvim-web-devicons',
        config = function()
            require('nvim-web-devicons').setup()
        end,
    }
}
