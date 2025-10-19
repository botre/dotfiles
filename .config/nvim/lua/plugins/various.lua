return {
    { 'adelarsq/vim-matchit' },
    {
        'folke/todo-comments.nvim',
        dependencies = { 'nvim-lua/plenary.nvim' },
        opts = {
            keywords = {
                TODO = { icon = ' ', color = 'warning' }
            },
        },
    },
    {
        'folke/which-key.nvim',
        event = 'VeryLazy',
        config = function()
            local wk = require('which-key')
            wk.setup({})

            -- Register key groups
            wk.add({
                { '<leader>f', group = 'Find' },
                { '<leader>g', group = 'Go' },
                { '<leader>r', group = 'Rename/Refactor' },
                { '<leader>t', group = 'Tree' },
                { '<leader>[', group = 'Previous' },
                { '<leader>]', group = 'Next' },
            })
        end,
    },
    {
        'kana/vim-textobj-entire',
        dependencies = {
            'kana/vim-textobj-user'
        }
    },
    {
        'letieu/btw.nvim',
        config = function()
            require('btw').setup({
                text = 'Neovim BTW',
            })
        end
    },
    { 'tpope/vim-commentary' },
    { 'tpope/vim-eunuch' },
    { 'tpope/vim-surround' },
    { 'unblevable/quick-scope' },
    {
        'windwp/nvim-autopairs',
        event = 'InsertEnter',
        config = true,
    },
}
