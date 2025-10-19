return {
    {
        'nvim-tree/nvim-tree.lua',
        dependencies = {
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            local function map(m, k, v, desc)
                vim.keymap.set(m, k, v, { silent = true, desc = desc })
            end

            map('n', '<C-t>', '<CMD>NvimTreeToggle<CR>', 'Tree Toggle')
            map('x', '<C-t>', '<CMD>NvimTreeToggle<CR>', 'Tree Toggle')

            map('n', '<leader>tt', '<CMD>NvimTreeToggle<CR>', 'Tree Toggle')
            map('x', '<leader>tt', '<CMD>NvimTreeToggle<CR>', 'Tree Toggle')

            map('n', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>', 'Tree Find Opened File')
            map('x', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>', 'Tree Find Opened File')

            require('nvim-tree').setup({
                filters = {
                    git_ignored = false,
                    dotfiles = false,
                },
                git = {
                    enable = true,
                },
            })
        end,
    },
}
