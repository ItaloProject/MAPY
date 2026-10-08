-- E-mail do usuário é opcional (campo de contato). Remove a obrigatoriedade.
alter table usuarios
  alter column email drop not null;
