return {
    {
        'nvim-lualine/lualine.nvim',
        dependencies = { 'nvim-tree/nvim-web-devicons' },
        config = function()
            require('lualine').setup({
                options = {
                    theme = 'auto',
                    disabled_filetypes = {
                        'snacks_picker_list',
                    },
                },
            })
        end,
    },
}
