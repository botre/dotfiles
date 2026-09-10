return {
    {
        'nvim-mini/mini.tabline',
        dependencies = {
            -- mini.tabline prefers mini.icons and falls back to this
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            require('mini.tabline').setup()

            vim.keymap.set('n', '<leader>[t', ':bprevious<CR>', { desc = 'Previous tab' })
            vim.keymap.set('n', '<leader>]t', ':bnext<CR>', { desc = 'Next tab' })
            vim.keymap.set('n', '<tab>[', ':bprevious<CR>', { desc = 'Previous buffer' })
            vim.keymap.set('n', '<tab>]', ':bnext<CR>', { desc = 'Next buffer' })
            vim.keymap.set('n', '<tab>a', ':enew<CR>', { desc = 'New buffer' })
            vim.keymap.set('n', '<tab>d', function()
                -- Unlike :bdelete, this keeps the window layout intact
                Snacks.bufdelete()
            end, { desc = 'Delete buffer' })
        end,
    },
}
