return {
    {
        'nvim-tree/nvim-tree.lua',
        dependencies = {
            'nvim-tree/nvim-web-devicons',
        },
        config = function()
            local function map(m, k, v)
                vim.keymap.set(m, k, v, { silent = true })
            end

            map('n', '<C-t>', '<CMD>NvimTreeToggle<CR>')
            map('x', '<C-t>', '<CMD>NvimTreeToggle<CR>')

            map('n', '<leader>tt', '<CMD>NvimTreeToggle<CR>')
            map('x', '<leader>tt', '<CMD>NvimTreeToggle<CR>')

            map('n', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>')
            map('x', '<leader>tf', '<CMD>NvimTreeFindFileToggle<CR>')

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