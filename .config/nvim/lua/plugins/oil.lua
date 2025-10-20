return {
    {
        'stevearc/oil.nvim',
        dependencies = {
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            require('oil').setup({
                columns = { 'icon' },
                view_options = {
                    show_hidden = true,
                },
                float = {
                    preview_split = 'right',
                },
            })
            vim.keymap.set('n', '-', '<CMD>Oil<CR>', { desc = 'Oil' })
            vim.keymap.set('n', '<leader>-', require('oil').toggle_float, { desc = 'Oil float' })

            -- Automatically open preview when entering oil
            vim.api.nvim_create_autocmd('User', {
                pattern = 'OilEnter',
                callback = vim.schedule_wrap(function(args)
                    local oil = require('oil')
                    if vim.api.nvim_get_current_buf() == args.data.buf and oil.get_cursor_entry() then
                        oil.open_preview()
                    end
                end),
            })
        end,
    },
}
