return {
    {
        'catppuccin/nvim',
        name = 'catppuccin',
        priority = 1000,
        config = function()
            require('catppuccin').setup({
                flavour = 'latte',
                -- Enable integrations for installed plugins.
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
