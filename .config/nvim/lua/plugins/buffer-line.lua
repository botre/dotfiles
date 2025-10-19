return {
    {
        'akinsho/bufferline.nvim',
        dependencies = {
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            require('bufferline').setup({
                options = {
                    diagnostics = 'nvim_lsp',
                },
            })
            vim.keymap.set('n', '<leader>[t', ':bprevious<CR>', { desc = 'Previous tab' })
            vim.keymap.set('n', '<leader>]t', ':bnext<CR>', { desc = 'Next tab' })
            vim.keymap.set('n', '<tab>[', ':bprevious<CR>', { desc = 'Previous buffer' })
            vim.keymap.set('n', '<tab>]', ':bnext<CR>', { desc = 'Next buffer' })
            vim.keymap.set('n', '<tab>a', ':enew<CR>', { desc = 'New buffer' })
            vim.keymap.set('n', '<tab>d', ':bdelete<CR>', { desc = 'Delete buffer' })
        end,
    },
}
