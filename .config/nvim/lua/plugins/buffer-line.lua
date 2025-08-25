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
            vim.keymap.set('n', '<leader>[t', ':bprevious<CR>')
            vim.keymap.set('n', '<leader>]t', ':bnext<CR>')
            vim.keymap.set('n', '<tab>[', ':bprevious<CR>')
            vim.keymap.set('n', '<tab>]', ':bnext<CR>')
            vim.keymap.set('n', '<tab>a', ':enew<CR>')
            vim.keymap.set('n', '<tab>d', ':bdelete<CR>')
        end,
    },
}
