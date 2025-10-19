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
            wk.setup({
                icons = {
                    mappings = false,
                },
            })

            -- Register key groups
            wk.add({
                { '<leader>f',   group = 'Find' },
                { '<leader>g',   group = 'Go' },
                { '<leader>=',   group = 'Format' },
                { '<leader>t',   group = 'Tree' },
                { '<leader>w',   group = 'Window' },
                { '<leader>[',   group = 'Previous' },
                { '<leader>]',   group = 'Next' },

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
                { '<leader>n',   desc = 'Toggle Relative Numbers' },
                { '<leader>w-',  desc = 'Split Horizontal' },
                { '<leader>w\\', desc = 'Split Vertical' },
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
