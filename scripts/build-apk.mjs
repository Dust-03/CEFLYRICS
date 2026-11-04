// Compila la app de Android y deja el APK donde lo ofrece la PC. Todo queda en el disco D.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TOOLS = process.env.CEF_TOOLS ?? 'D:/Programas';
const JAVA_HOME = join(TOOLS, 'JDK17');
const ANDROID_HOME = join(TOOLS, 'AndroidSDK');
const GRADLE = join(TOOLS, 'Gradle/gradle-8.7/bin/gradle.bat');
const SIGNING = join(TOOLS, 'CEFLIRICS-firma');
const KEYSTORE = join(SIGNING, 'ceflirics.jks');
const PROPERTIES = join(SIGNING, 'firma.properties');
const ALIAS = 'ceflirics';

if (!existsSync(KEYSTORE)) {
  mkdirSync(SIGNING, { recursive: true });
  const password = randomBytes(18).toString('base64url');
  execFileSync(join(JAVA_HOME, 'bin/keytool.exe'), [
    '-genkeypair',
    '-keystore',
    KEYSTORE,
    '-alias',
    ALIAS,
    '-keyalg',
    'RSA',
    '-keysize',
    '2048',
    '-validity',
    '10000',
    '-storepass',
    password,
    '-keypass',
    password,
    '-dname',
    'CN=CEFLIRICS, O=CEF, C=AR',
  ]);
  const path = resolve(KEYSTORE).replaceAll('\\', '/');
  writeFileSync(PROPERTIES, `storeFile=${path}\nalias=${ALIAS}\npassword=${password}\n`);
}
copyFileSync(PROPERTIES, 'android/firma.properties');

execFileSync('cmd.exe', ['/c', GRADLE.replaceAll('/', '\\'), 'assembleRelease', '--no-daemon', '--console=plain'], {
  cwd: 'android',
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME, ANDROID_HOME, GRADLE_USER_HOME: join(TOOLS, 'Gradle/home') },
});

copyFileSync('android/app/build/outputs/apk/release/app-release.apk', 'resources/ceflirics-control.apk');
console.log('APK listo en resources/ceflirics-control.apk');
