-- forward_link_status 는 now() 로 만료를 보므로 immutable 이 아니라 stable 이다 (10-29 보안 검토)
alter function app.forward_link_status(app.access_links, app.vouchers) stable;
