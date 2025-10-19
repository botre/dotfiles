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
            vim.keymap.set('n', '<leader>[t', ':bprevious<CR>', { desc = 'Previous Tab' })
            vim.keymap.set('n', '<leader>]t', ':bnext<CR>', { desc = 'Next Tab' })
            vim.keymap.set('n', '<tab>[', ':bprevious<CR>', { desc = 'Previous Buffer' })
            vim.keymap.set('n', '<tab>]', ':bnext<CR>', { desc = 'Next Buffer' })
            vim.keymap.set('n', '<tab>a', ':enew<CR>', { desc = 'New Buffer' })
            vim.keymap.set('n', '<tab>d', ':bdelete<CR>', { desc = 'Delete Buffer' })
        end,
    },
}
