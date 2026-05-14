return {
    {
        'nvim-treesitter/nvim-treesitter',
        branch = 'main',
        lazy = false,
        build = ':TSUpdate',
        config = function()
            require('nvim-treesitter').install({
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
            })

            vim.api.nvim_create_autocmd('FileType', {
                callback = function(args)
                    local ok = pcall(vim.treesitter.start, args.buf)
                    if ok then
                        vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
                    end
                end,
            })
        end,
    },
    {
        'nvim-treesitter/nvim-treesitter-textobjects',
        branch = 'main',
        dependencies = {
            'nvim-treesitter/nvim-treesitter',
        },
        config = function()
            require('nvim-treesitter-textobjects').setup({
                move = {
                    set_jumps = true,
                },
            })

            local move = require('nvim-treesitter-textobjects.move')
            vim.keymap.set('n', '<leader>[f', function()
                move.goto_previous_start('@function.outer', 'textobjects')
            end, { desc = 'Previous function' })
            vim.keymap.set('n', '<leader>]f', function()
                move.goto_next_start('@function.outer', 'textobjects')
            end, { desc = 'Next function' })
        end,
    },
}
