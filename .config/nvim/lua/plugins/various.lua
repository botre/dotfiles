return {
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
                { '<leader>C',   desc = 'Change to end (black hole)' },
                { '<leader>D',   desc = 'Delete to end (black hole)' },
                { '<leader>S',   desc = 'Substitute line (black hole)' },
                { '<leader>X',   desc = 'Delete char backward (black hole)' },
                { '<leader>c',   desc = 'Change (black hole)' },
                { '<leader>d',   desc = 'Delete (black hole)' },
                { '<leader>s',   desc = 'Substitute (black hole)' },
                { '<leader>x',   desc = 'Delete char (black hole)' },
                { '<leader>h',   desc = 'Toggle highlight search' },
                { '<leader>n',   desc = 'Toggle relative numbers' },
                { '<leader>w-',  desc = 'Split horizontal' },
                { '<leader>w\\', desc = 'Split vertical' },
            })
        end,
    },
    {
        -- v4 registers its keymaps from plugin/, so setup() is only for
        -- overriding defaults and is not needed to initialize the plugin.
        'kylechui/nvim-surround',
        version = '*',
        event = 'VeryLazy',
    },
    {
        'nvim-mini/mini.ai',
        event = 'VeryLazy',
        config = function()
            require('mini.ai').setup({
                custom_textobjects = {
                    -- Stands in for vim-textobj-entire. A single-region spec
                    -- means ae and ie both select the whole buffer, where
                    -- vim-textobj-entire had ie skip leading and trailing
                    -- blank lines.
                    e = function()
                        return {
                            from = { line = 1, col = 1 },
                            to = {
                                line = vim.fn.line('$'),
                                col = math.max(vim.fn.getline('$'):len(), 1),
                            },
                            vis_mode = 'V',
                        }
                    end,
                },
            })
        end,
    },
    {
        'letieu/btw.nvim',
        config = function()
            require('btw').setup({
                text = 'Neovim BTW',
            })
        end
    },
    { 'tpope/vim-eunuch' },
    { 'unblevable/quick-scope' },
    {
        'windwp/nvim-autopairs',
        event = 'InsertEnter',
        config = true,
    },
}
