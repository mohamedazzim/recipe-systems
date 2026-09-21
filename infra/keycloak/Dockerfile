FROM quay.io/keycloak/keycloak:26.2

# Realm import: kc.sh start --import-realm picks up everything in
# /opt/keycloak/data/import on boot.
COPY recipesystems-realm.json /opt/keycloak/data/import/

# Self-signed TLS key material. Railway terminates TLS at the edge, but
# Keycloak 26 still demands a key store when HTTPS is enabled.
RUN keytool -genkeypair -alias localhost -keyalg RSA -keysize 2048 \
  -storetype PKCS12 -keystore /opt/keycloak/conf/server.keystore \
  -storepass changeit -dname "CN=keycloak" -validity 3650
