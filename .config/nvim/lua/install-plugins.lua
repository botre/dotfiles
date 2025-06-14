return function(packer_instance)
    vim.cmd [[packadd packer.nvim]]

    require('packer').startup(function(use)
        use { 'wbthomason/packer.nvim' }

        use { 'adelarsq/vim-matchit' }

        use {
            'catppuccin/nvim',
            as = 'catppuccin',
            config = function()
                require('catppuccin').setup({
                    flavour = 'latte',
                    integrations = {
                        mason = true,
                        native_lsp = {
                            enabled = true
                        },
                        nvimtree = true,
                        telescope = true,
                    }
                })
                vim.cmd.colorscheme('catppuccin-latte')
            end
        }
        use {
            'akinsho/bufferline.nvim',
            requires = {
                'catppuccin/nvim',
                'nvim-tree/nvim-web-devicons',
            },
            config = function()
                require('bufferline').setup({
                    options = {
                        diagnostics = 'nvim_lsp',
                    }
                })
                vim.keymap.set('n', '<leader>[t', ':bprevious<CR>')
                vim.keymap.set('n', '<leader>]t', ':bnext<CR>')
                vim.keymap.set('n', '<tab>[', ':bprevious<CR>')
                vim.keymap.set('n', '<tab>]', ':bnext<CR>')
                vim.keymap.set('n', '<tab>a', ':enew<CR>')
                vim.keymap.set('n', '<tab>d', ':bdelete<CR>')
            end
        }
        use { 'jiangmiao/auto-pairs' }
        use { 'kana/vim-textobj-entire' }
        use { 'kana/vim-textobj-user' }
        use({
            'kdheepak/lazygit.nvim',
            requires = { 'nvim-lua/plenary.nvim' },
            config = function()
                vim.keymap.set('n', '<leader>gg', ':LazyGit<CR>', {})
            end
        })
        use {
            'lewis6991/gitsigns.nvim',
            config = function()
                require('gitsigns').setup()
            end
        }
        use {
            'letieu/btw.nvim',
            config = function()
                require('btw').setup({
                    text = 'Neovim BTW',
                })
            end
        }
        use {
            'nvim-lualine/lualine.nvim',
            requires = { 'nvim-tree/nvim-web-devicons' },
            config = function()
                require('lualine').setup({
                    options = {
                        theme = 'catppuccin',
                        disabled_filetypes = { 'packer', 'NvimTree' },
                    }
                })
            end
        }
        use { 'nvim-lua/plenary.nvim' }
        use {
            'nvim-telescope/telescope.nvim',
            requires = { 'nvim-lua/plenary.nvim' },
            config = function()
                local builtin = require('telescope.builtin')
                vim.keymap.set('n', '<leader><space>', builtin.oldfiles, {})
                vim.keymap.set('n', '<leader>ff', builtin.find_files, {})
                vim.keymap.set('n', '<leader>fg', builtin.live_grep, {})
                vim.keymap.set('n', '<leader>fr', builtin.oldfiles, {})
                vim.keymap.set('n', '<leader>fu', builtin.lsp_references, {})
            end
        }
        use {
            'nvim-tree/nvim-web-devicons',
            config = function()
                require('nvim-web-devicons').setup()
            end
        }
        use {
            'nvim-tree/nvim-tree.lua',
            requires = {
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
            end
        }
        use {
            'nvim-treesitter/nvim-treesitter',
            run = ':TSUpdate',
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
                    auto_install = true,
                    highlight = {
                        enable = true,
                        additional_vim_regex_highlighting = false,
                    },
                })
            end
        }
        use {
            'stevearc/oil.nvim',
            requires = {
                'nvim-tree/nvim-web-devicons',
            },
            config = function()
                require('oil').setup {
                    columns = { 'icon' },
                    view_options = {
                        show_hidden = true,
                    }
                }
                vim.keymap.set('n', '-', '<CMD>Oil<CR>')
                vim.keymap.set('n', '<leader>-', require('oil').toggle_float)
            end
        }
        use { 'tpope/vim-commentary' }
        use { 'tpope/vim-eunuch' }
        use { 'tpope/vim-fugitive' }
        use { 'tpope/vim-surround' }
        use { 'unblevable/quick-scope' }
        use {
            'VonHeikemen/lsp-zero.nvim',
            requires = {
                -- LSP support
                { 'neovim/nvim-lspconfig' },
                { 'williamboman/mason-lspconfig.nvim' },
                { 'williamboman/mason.nvim' },

                -- Autocompletion
                { 'hrsh7th/cmp-buffer' },
                { 'hrsh7th/cmp-nvim-lsp' },
                { 'hrsh7th/cmp-nvim-lua' },
                { 'hrsh7th/cmp-path' },
                { 'hrsh7th/nvim-cmp' },
            },
            config = function()
                local lsp = require('lsp-zero')

                require('mason').setup({})
                require('mason-lspconfig').setup({
                    ensure_installed = {
                        'arduino_language_server',
                        'astro',
                        'clangd',
                        'dockerls',
                        'emmet_ls',
                        'eslint',
                        'gopls',
                        'graphql',
                        'html',
                        'jsonls',
                        'lua_ls',
                        'pyright',
                        'rust_analyzer',
                        'tailwindcss',
                        'taplo',
                        'ts_ls',
                        'vimls',
                        'yamlls',
                    },
                    handlers = {
                        lsp.default_setup,
                    },
                })

                local cmp = require('cmp')
                local cmp_select = { behavior = cmp.SelectBehavior.Select }
                cmp.setup({
                    mapping = cmp.mapping.preset.insert({
                        ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
                        ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),

                        ['<C-[>'] = cmp.mapping.select_prev_item(cmp_select),
                        ['<C-]>'] = cmp.mapping.select_next_item(cmp_select),

                        ['<C-k>'] = cmp.mapping.select_prev_item(cmp_select),
                        ['<C-j>'] = cmp.mapping.select_next_item(cmp_select),

                        ['<CR>'] = cmp.mapping.confirm({ select = true }),
                    }),
                    sources = {
                        { name = 'copilot', group_index = 2 },
                        { name = 'nvim_lsp', group_index = 2 },
                        { name = 'path', group_index = 2 },
                    },
                })

                lsp.on_attach(function(_, bufnr)
                    local options = { buffer = bufnr, remap = false }
                    -- Format the buffer
                    vim.keymap.set('n', '<leader>==', function()
                        vim.lsp.buf.format({ async = true })
                    end, options)

                    -- Change navigation
                    vim.keymap.set('n', '<leader>[c', function()
                        -- TODO: jump to previous VCS change marker
                    end, options)
                    vim.keymap.set('n', '<leader>]c', function()
                        -- TODO: jump to next VCS change marker
                    end, options)

                    -- Error navigation
                    vim.keymap.set('n', '<leader>[e', function()
                        vim.diagnostic.goto_prev({ severity = vim.diagnostic.severity.ERROR })
                    end, options)
                    vim.keymap.set('n', '<leader>]e', function()
                        vim.diagnostic.goto_next({ severity = vim.diagnostic.severity.ERROR })
                    end, options)

                    -- Function navigation
                    vim.keymap.set('n', '<leader>[f', function()
                        -- TODO: jump to previous function
                    end, options)
                    vim.keymap.set('n', '<leader>]f', function()
                        -- TODO: jump to next function
                    end, options)

                    -- Rename symbol
                    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, options)

                    -- Show documentation
                    vim.keymap.set('n', 'K', vim.lsp.buf.hover, options)

                    -- Show diagnostics window for current line
                    vim.keymap.set('n', '<leader>e', function()
                        vim.diagnostic.open_float(0, { scope = 'line' })
                    end)

                    -- Go to definition
                    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, options)
                    vim.keymap.set('n', '<leader>gd', vim.lsp.buf.definition, options)

                    -- show code actions
                    vim.keymap.set('n', '<leader>ga', vim.lsp.buf.code_action, options)
                end)

                lsp.setup()
            end
        }

        use {
            'nvimtools/none-ls.nvim',
            'jay-babu/mason-null-ls.nvim',
            config = function()
                require('mason-null-ls').setup {
                    ensure_installed = {
                        'black',
                        'clang-format',
                        'mypy',
                        'prettierd',
                        'ruff',
                    }
                }

                local null_ls = require('null-ls')
                null_ls.setup({
                    sources = {
                        null_ls.builtins.diagnostics.mypy,
                        null_ls.builtins.diagnostics.ruff,
                        null_ls.builtins.formatting.black,
                        null_ls.builtins.formatting.clang_format,
                        null_ls.builtins.formatting.prettierd,
                    }
                })
            end
        }

        use {
            'zbirenbaum/copilot.lua',
            cmd = 'Copilot',
            config = function()
                require('copilot').setup({
                    suggestion = { enabled = false },
                    panel = { enabled = false },
                })
            end,
        }
        use {
            'zbirenbaum/copilot-cmp',
            after = { 'copilot.lua' },
            config = function()
                require('copilot_cmp').setup()
            end
        }

        if packer_instance then
            require('packer').sync()
        end
    end)
end