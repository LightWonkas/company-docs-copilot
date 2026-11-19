# Erişim Talep ve Yetki Yönetimi Prosedürü

Belge sahibi: Bilgi Teknolojileri · Kapsam: BT departmanı · Sürüm 3.0 · Yürürlük: 1 Mart 2026

## 1. Amaç

Bu prosedür, Atlas Lojistik sistemlerine erişim yetkilerinin nasıl talep edildiğini, onaylandığını, verildiğini, gözden geçirildiğini ve kaldırıldığını tanımlar. Prosedür, BT ekiplerinin uygulayacağı adımları içerir. Çalışanlar erişim taleplerini Yardım Masası portalındaki erişim talep formuyla iletir.

## 2. Temel ilkeler

- **En az yetki:** Kullanıcıya yalnızca işini yapması için gereken yetki verilir.
- **Görevler ayrılığı:** Aynı kişi hem satın alma talebi oluşturup hem de onaylayamaz; AtlasERP rolleri buna göre tasarlanmıştır.
- **Çift onay:** Her erişim talebi önce kullanıcının yöneticisi, sonra sistem sahibi tarafından onaylanır.
- **Kayıt:** Tüm talepler ve onaylar Yardım Masası sisteminde saklanır ve 5 yıl boyunca silinmez.

## 3. Sistem sahipleri ve tamamlanma süreleri

| Sistem | Sistem sahibi | Onay sonrası tamamlanma süresi |
|---|---|---|
| E-posta ve Teams | BT Altyapı | 1 iş günü |
| VPN | BT Altyapı | 1 iş günü |
| AtlasERP (SAP tabanlı) | Finans | 3 iş günü |
| AtlasWMS | Operasyon – Depo | 2 iş günü |
| AtlasTMS | Operasyon – Filo | 2 iş günü |
| AtlasCRM | Satış | 2 iş günü |
| HRportal yönetici rolleri | İnsan Kaynakları | 3 iş günü |
| Paylaşımlı klasörler | Klasör sahibi | 1 iş günü |

Süreler, son onayın verildiği andan itibaren hesaplanır.

## 4. Ayrıcalıklı erişim

Sunucu yöneticisi, veritabanı yöneticisi ve güvenlik duvarı yöneticisi gibi ayrıcalıklı hesaplar için ek kurallar uygulanır:

1. Ayrıcalıklı erişim, kişisel hesaptan ayrı bir yönetici hesabıyla verilir (ör. `adm-` önekli hesap).
2. Ayrıcalıklı erişim **en fazla 90 gün** için verilir ve süre sonunda yeniden onaylanmalıdır.
3. Ayrıcalıklı oturumlar, ayrıcalıklı erişim yönetimi aracı üzerinden açılır ve kayıt altına alınır.
4. Ayrıcalıklı erişim talepleri ayrıca BT Altyapı Müdürü tarafından onaylanır.

## 5. Geçici erişim

Proje veya denetim gibi geçici ihtiyaçlar için verilen erişimlerin bitiş tarihi talep sırasında girilir. Bitiş tarihi girilmeyen geçici erişim talepleri reddedilir. Geçici erişimin süresi 30 günü aşamaz; uzatma için yeni talep gerekir.

## 6. Dış kullanıcılar

Danışman, denetçi ve tedarikçi gibi dış kullanıcılar yalnızca sözleşmesi ve gizlilik taahhütnamesi sisteme yüklendikten sonra hesap alabilir. Dış kullanıcı hesapları `ext-` önekiyle açılır, en fazla 90 gün geçerlidir ve MFA zorunludur.

## 7. Çeyreklik erişim gözden geçirmesi

Sistem sahipleri, her çeyrek sonunu izleyen **15 gün içinde** kendi sistemlerine ait kullanıcı listesini gözden geçirir. BT Güvenlik ekibi, gözden geçirme listelerini çeyrek sonunun ilk iş günü dağıtır. Gözden geçirmede onaylanmayan yetkiler, süre sonunda otomatik olarak kaldırılır.

| Çeyrek | Liste dağıtımı | Gözden geçirme son tarihi |
|---|---|---|
| 2026 Ç1 | 1 Nisan 2026 | 15 Nisan 2026 |
| 2026 Ç2 | 1 Temmuz 2026 | 15 Temmuz 2026 |
| 2026 Ç3 | 1 Ekim 2026 | 15 Ekim 2026 |
| 2026 Ç4 | 4 Ocak 2027 | 15 Ocak 2027 |

## 8. İşten ayrılma ve görev değişikliği

- İşten ayrılan çalışanın tüm erişimleri **son iş gününde saat 18:00'de** kapatılır. Erken kapatma gerekiyorsa İK, BT'ye yazılı bilgi verir.
- Görev değişikliğinde eski role ait yetkiler 10 iş günü içinde kaldırılır; yeni rol için ayrı talep açılır.
- Ayrılan çalışanın e-posta kutusu 90 gün boyunca yöneticisine yönlendirilir, sonra arşivlenir.

## 9. Acil erişim

Kritik bir arızada sistem sahibine ulaşılamazsa, BT Altyapı Müdürü 24 saati aşmayacak şekilde acil erişim verebilir. Acil erişim, ertesi iş günü sistem sahibi tarafından onaylanmazsa kaldırılır.

## 10. İletişim

Sorular: erisim@atlas-lojistik.test.
