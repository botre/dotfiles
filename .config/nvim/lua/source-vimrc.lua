vim.api.nvim_exec(
        [[
            set runtimepath^=~/.vim runtimepath+=~/.vim/after
            let &packpath=&runtimepath
            source ~/.vimrc
            ]], false)