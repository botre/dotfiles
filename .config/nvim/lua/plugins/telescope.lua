return {
    {
        'nvim-telescope/telescope.nvim',
        dependencies = { 'nvim-lua/plenary.nvim' },
        config = function()
            require('telescope').setup({
                defaults = {
                    file_ignore_patterns = {
                        ".git/",
                        "node_modules/",
                    }
                }
            })

            local builtin = require('telescope.builtin')
            vim.keymap.set('n', '<leader><space>', builtin.oldfiles, {})
            vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
            vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
            vim.keymap.set('n', '<leader>fr', builtin.oldfiles, {})
            vim.keymap.set('n', '<leader>fu', builtin.lsp_references, {})
        end,
    }
}
