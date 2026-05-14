return {
    {
        'catppuccin/nvim',
        name = 'catppuccin',
        priority = 1000,
        config = function()
            require('catppuccin').setup({
                flavour = 'latte',
                integrations = {
                    blink_cmp = true,
                    bufferline = true,
                    gitsigns = true,
                    mason = true,
                    native_lsp = { enabled = true },
                    nvimtree = true,
                    telescope = true,
                    treesitter = true,
                    which_key = true,
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
