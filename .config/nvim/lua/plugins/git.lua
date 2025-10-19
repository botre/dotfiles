return {
    { 'tpope/vim-fugitive' },
    {
        'kdheepak/lazygit.nvim',
        dependencies = { 'nvim-lua/plenary.nvim' },
        config = function()
            vim.keymap.set('n', '<leader>gg', ':LazyGit<CR>', { desc = 'LazyGit' })
        end,
    },
    {
        'lewis6991/gitsigns.nvim',
        config = function()
            require('gitsigns').setup()
            -- VCS Navigation
            vim.keymap.set('n', '<leader>[c', function()
                vim.cmd('Gitsigns prev_hunk')
            end, { desc = 'Previous change' })
            vim.keymap.set('n', '<leader>]c', function()
                vim.cmd('Gitsigns next_hunk')
            end, { desc = 'Next change' })
        end,
    },
}
