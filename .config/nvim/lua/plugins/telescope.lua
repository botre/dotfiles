return {
    {
        'nvim-telescope/telescope.nvim',
        dependencies = { 'nvim-lua/plenary.nvim' },
        config = function()
            require('telescope').setup({
                defaults = {
                    file_ignore_patterns = {
                        '.git/',
                        'node_modules/',
                    }
                }
            })

            local builtin = require('telescope.builtin')
            vim.keymap.set('n', '<leader><space>', builtin.oldfiles, { desc = 'Recent Files' })
            vim.keymap.set('n', '<leader>ff', builtin.find_files, { desc = 'Find Files' })
            vim.keymap.set('n', '<leader>fg', builtin.live_grep, { desc = 'Live Grep' })
            vim.keymap.set('n', '<leader>fr', builtin.oldfiles, { desc = 'Recent Files' })
            vim.keymap.set('n', '<leader>fu', builtin.lsp_references, { desc = 'Find References' })
        end,
    }
}
