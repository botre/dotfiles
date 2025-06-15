return {
    {
        'nvim-treesitter/nvim-treesitter',
        lazy = false,
        build = ':TSUpdate',
        config = function()
            require('nvim-treesitter.configs').setup({
                ensure_installed = {
                    'arduino',
                    'astro',
                    'bash',
                    'c',
                    'cpp',
                    'css',
                    'dockerfile',
                    'go',
                    'graphql',
                    'html',
                    'javascript',
                    'json',
                    'lua',
                    'markdown',
                    'markdown_inline',
                    'python',
                    'rust',
                    'toml',
                    'tsx',
                    'typescript',
                    'vim',
                    'yaml',
                },
                sync_install = false,
                highlight = {
                    enable = true,
                    additional_vim_regex_highlighting = false,
                },
            })
        end,
    },
    {
        "nvim-treesitter/nvim-treesitter-textobjects",
        dependencies = {
            "nvim-treesitter/nvim-treesitter"
        },
        config = function()
            mover = require('nvim-treesitter.textobjects.move')
            -- Function Navigation
            vim.keymap.set('n', '<leader>[f', function()
                mover.goto_previous_start('@function.outer')
            end, opts)
            vim.keymap.set('n', '<leader>]f', function()
                mover.goto_next_start('@function.outer')
            end, opts)
        end
    }
}