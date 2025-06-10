return function(packer_instance)
    vim.cmd [[packadd packer.nvim]]

    require('packer').startup(function(use)
        use { 'wbthomason/packer.nvim' }

        use { 'adelarsq/vim-matchit' }
        use { 'akinsho/bufferline.nvim', requires = 'nvim-tree/nvim-web-devicons' }
        use { 'catppuccin/nvim', as = 'catppuccin' }
        use { 'jiangmiao/auto-pairs' }
        use { 'kana/vim-textobj-entire' }
        use { 'kana/vim-textobj-user' }
        use({
            'kdheepak/lazygit.nvim',
        })
        use {
            'lewis6991/gitsigns.nvim',
            config = function()
                require('gitsigns').setup()
            end
        }
        use { 'letieu/btw.nvim' }
        use {
            'nvim-lualine/lualine.nvim',
            requires = { 'kyazdani42/nvim-web-devicons' }
        }
        use { 'nvim-lua/plenary.nvim' }
        use { 'nvim-telescope/telescope.nvim' }
        use { 'nvim-tree/nvim-web-devicons' }
        use {
            'nvim-tree/nvim-tree.lua',
        }
        use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
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
            }
        }

        use {
            'nvimtools/none-ls.nvim',
            'jay-babu/mason-null-ls.nvim',
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