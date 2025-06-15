return {
    {
        'catppuccin/nvim',
        as = 'catppuccin',
        priority = 1000,
        config = function()
            require('catppuccin').setup({
                flavour = 'latte',
                integrations = {
                    mason = true,
                    native_lsp = {
                        enabled = true,
                    },
                    nvimtree = true,
                    telescope = true,
                },
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