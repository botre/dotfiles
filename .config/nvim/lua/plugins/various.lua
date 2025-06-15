return {
    {
        'letieu/btw.nvim',
        config = function()
            require('btw').setup({
                text = 'Neovim BTW',
            })
        end
    },
    { 'adelarsq/vim-matchit' },
    { 'jiangmiao/auto-pairs' },
    { 'kana/vim-textobj-entire' },
    { 'kana/vim-textobj-user' },
    { 'tpope/vim-commentary' },
    { 'tpope/vim-eunuch' },
    { 'tpope/vim-surround' },
    { 'unblevable/quick-scope' },
}