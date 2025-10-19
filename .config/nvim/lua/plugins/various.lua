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
                { '<leader>f',   group = 'Find' },
                { '<leader>g',   group = 'Go' },
                { '<leader>r',   group = 'Rename/Refactor' },
                { '<leader>t',   group = 'Tree' },
                { '<leader>[',   group = 'Previous' },
                { '<leader>]',   group = 'Next' },
                { '<leader>w',   group = 'Window' },

                -- Descriptions for .vimrc keymaps
                { '<leader>C',   desc = 'Change to End (Black Hole)' },
                { '<leader>D',   desc = 'Delete to End (Black Hole)' },
                { '<leader>S',   desc = 'Substitute Line (Black Hole)' },
                { '<leader>X',   desc = 'Delete Char Backward (Black Hole)' },
                { '<leader>c',   desc = 'Change (Black Hole)' },
                { '<leader>d',   desc = 'Delete (Black Hole)' },
                { '<leader>s',   desc = 'Substitute (Black Hole)' },
                { '<leader>x',   desc = 'Delete Char (Black Hole)' },
                { '<leader>h',   desc = 'Toggle Highlight Search' },
                { '<leader>w-',  desc = 'Split Horizontal' },
                { '<leader>w\\', desc = 'Split Vertical' },
                { '<leader>n',   desc = 'Toggle Relative Numbers' },
            })
        end,
        keys = {
            '<leader>?',
            function()
                require('which-key').show({ global = false })
            end,
            desc = 'Show Keymaps',
        }
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
