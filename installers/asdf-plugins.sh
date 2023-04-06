#!/usr/bin/env bash

asdf plugin add deno https://github.com/asdf-community/asdf-deno.git
asdf install deno latest
asdf global deno latest

asdf plugin-add golang https://github.com/kennyp/asdf-golang.git
asdf install golang latest
asdf global golang latest

asdf plugin-add lua https://github.com/Stratus3D/asdf-lua.git
asdf install lua latest
asdf global lua latest

asdf plugin add nodejs
asdf install nodejs latest
asdf global nodejs latest

asdf plugin add python
asdf install python latest
asdf global python latest

asdf plugin add ruby
asdf install ruby latest
asdf global ruby latest

asdf plugin-add rust https://github.com/asdf-community/asdf-rust.git
asdf install rust latest
asdf global rust latest

asdf plugin add terraform https://github.com/asdf-community/asdf-hashicorp.git
asdf install terraform latest
asdf global terraform latest

asdf plugin add yarn
asdf install yarn latest
asdf global yarn latest

