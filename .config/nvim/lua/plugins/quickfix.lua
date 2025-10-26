return {
    'stevearc/quicker.nvim',
    opts = {},
    config = function()
        -- Navigation keymaps
        vim.keymap.set('n', '[q', ':cprevious<CR>', { desc = 'Previous quickfix item' })
        vim.keymap.set('n', ']q', ':cnext<CR>', { desc = 'Next quickfix item' })

        -- Toggle keymaps
        vim.keymap.set('n', '<leader>q', function()
            require('quicker').toggle()
        end, {
            desc = 'Toggle quickfix',
        })

        -- Setup with expand/collapse keys
        require('quicker').setup({
            keys = {
                {
                    '>',
                    function()
                        require('quicker').expand({ before = 2, after = 2, add_to_existing = true })
                    end,
                    desc = 'Expand quickfix context',
                },
                {
                    '<',
                    function()
                        require('quicker').collapse()
                    end,
                    desc = 'Collapse quickfix context',
                },
            },
        })
    end,
}
