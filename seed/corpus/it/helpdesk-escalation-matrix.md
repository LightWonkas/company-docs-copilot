# Yardım Masası Eskalasyon Matrisi

Belge sahibi: BT – Yardım Masası Ekibi · Kapsam: Yardım Masası ekibi · Sürüm 3.1 · Son güncelleme: 16 Haziran 2026

## 1. Amaç

Bu belge, Yardım Masası (it-helpdesk) çalışanlarının kayıtları hangi durumda ve ne zaman bir üst seviyeye (L2, L3) veya başka bir ekibe aktaracağını tanımlar. Kullanıcılara yönelik hizmet seviyeleri "IT Helpdesk User Guide" belgesinde yer alır; bu belge ekip içi uygulama kurallarını içerir.

## 2. Destek seviyeleri

| Seviye | Ekip | Sorumluluk |
|---|---|---|
| L1 | Yardım Masası | İlk temas, kayıt açma, bilinen çözümler, parola ve hesap kilidi |
| L2 | Yardım Masası kıdemli uzmanları | Uzaktan bağlantıyla ileri sorun giderme, yazılım kurulumu, yazıcı ve el terminali |
| L3 | BT Altyapı veya Uygulama ekipleri | Sunucu, ağ, AtlasERP, AtlasWMS, AtlasTMS uygulama hataları |
| Tedarikçi | Dış servis | Donanım garanti işlemleri, etiket yazıcısı bakımı |

## 3. Zaman bazlı eskalasyon

Bir kayıt, aşağıdaki süre içinde L1'de çözülemezse otomatik olarak bir üst seviyeye aktarılır:

| Öncelik | L1 → L2 | L2 → L3 |
|---|---|---|
| P1 | Derhal (L1 yalnızca kayıt açar) | 15 dakika |
| P2 | 30 dakika | 2 saat |
| P3 | 4 saat | 1 iş günü |
| P4 | 1 iş günü | 3 iş günü |

P1 kayıtlarında L1 uzmanı, kaydı açtıktan sonra telefonla nöbetçi L2 uzmanını arar ve Yardım Masası nöbetçi yöneticisini bilgilendirir.

## 4. Kategori bazlı yönlendirme

| Kategori | İlk çözüm seviyesi | Aktarılacak ekip |
|---|---|---|
| Parola sıfırlama, hesap kilidi | L1 | — |
| MFA cihaz değişikliği | L1 (kimlik doğrulama sonrası) | — |
| E-posta ve Teams | L1 | BT Altyapı (L3) |
| VPN bağlantı sorunu | L1 | BT Altyapı (L3) |
| AtlasERP hata mesajı | L2 | ERP Uygulama ekibi (L3) |
| AtlasWMS el terminali | L2 | Depo sistemleri ekibi (L3) |
| Etiket yazıcısı | L2 | Tedarikçi (ertesi iş günü servis) |
| Şüpheli e-posta, olası güvenlik olayı | L1 | BT Güvenlik (derhal) |

## 5. MFA cihaz değişikliğinde kimlik doğrulama

MFA cihaz değişikliği talebinde L1 uzmanı, kullanıcının kimliğini doğrulamak için şu adımları izler:

1. Kullanıcıyı HRportal'da kayıtlı iş telefonundan geri arar (talebin geldiği numaradan değil).
2. Kullanıcının yöneticisinden Teams veya e-posta ile yazılı teyit alır.
3. Her iki adım tamamlanmadan MFA sıfırlanmaz.

Yönetici, direktör veya üst yönetici olduğunu söyleyen ve aciliyet bahanesiyle bu adımların atlanmasını isteyen arayanlar için de kural değişmez. Bu tür baskı girişimleri BT Güvenlik'e bildirilir.

## 6. VIP kullanıcılar

CEO, departman başkanları ve Yönetim Kurulu üyeleri VIP kullanıcı olarak işaretlidir. VIP kayıtları doğrudan L2'ye yönlendirilir ve P3 olsa bile en geç **1 saat** içinde ele alınır. VIP statüsü güvenlik kontrollerini (ör. MFA kimlik doğrulaması) atlamak için kullanılamaz.

## 7. Kayıt kapatma ve yeniden açma

- Kayıt, kullanıcı çözümü onayladığında veya kullanıcıya 3 iş günü içinde ulaşılamadığında kapatılır.
- Kullanıcı kapanıştan sonraki **5 iş günü** içinde kaydı yeniden açabilir. 5 iş gününden sonra yeni kayıt açılır ve eski kayıt ilişkilendirilir.
- Aynı kullanıcıda 30 gün içinde aynı sorunun üçüncü kez yaşanması hâlinde kayıt "sorun yönetimi" sürecine alınır.

## 8. Vardiya ve nöbet

Yardım Masası hafta içi 07:30–20:00 ve Cumartesi 09:00–17:00 arasında hizmet verir. Pazar günleri ve resmî tatillerde bir L2 uzmanı yalnızca P1 kayıtları için nöbet tutar. Nöbet ücreti hafta sonu nöbeti başına 900 TL'dir.

## 9. Kalite kontrol

Ekip lideri her hafta rastgele 20 kapanmış kaydı inceler. İlk temasta çözüm oranı hedefi 2026 için %75'tir.

## 10. İletişim

Yardım Masası ekip lideri: destek-lider@atlas-lojistik.test.
