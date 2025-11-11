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
                },
                pickers = {
                    oldfiles = {
                        cwd_only = true, -- Show recent files from current project only
                    }
                }
            })

            local builtin = require('telescope.builtin')
            vim.keymap.set('n', '<leader><space>', builtin.oldfiles, { desc = 'Recent files' })
            vim.keymap.set('n', '<leader>ff', builtin.find_files, { desc = 'Find files' })
            vim.keymap.set('n', '<leader>fg', builtin.live_grep, { desc = 'Live grep' })
            vim.keymap.set('n', '<leader>fr', builtin.oldfiles, { desc = 'Recent files' })
            vim.keymap.set('n', '<leader>fu', builtin.lsp_references, { desc = 'Find references' })
        end,
    }
}
