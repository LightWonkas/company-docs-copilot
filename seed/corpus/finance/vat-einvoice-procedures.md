# KDV ve e-Fatura Uygulama Notları

Belge sahibi: Finans – Muhasebe Ekibi · Kapsam: Muhasebe ekibi · Sürüm 1.8 · Son güncelleme: 3 Ağustos 2026

## 1. Amaç

Bu not, Muhasebe ekibinin (finance-accounting) satış ve alış faturalarında KDV uygulaması, e-Fatura ve e-Arşiv süreçleri ile ilgili iç kurallarını özetler. Not, ekip içi uygulama birliği sağlamak için hazırlanmıştır; mevzuat değişikliklerinde Vergi Müdürü'nün yorumu esastır.

## 2. Satış faturalarında KDV oranları

| Hizmet | Atlas uygulaması | Not |
|---|---|---|
| Yurt içi kara yolu taşımacılığı | %20 KDV | Standart oran |
| Depolama ve elleçleme | %20 KDV | Standart oran |
| Uluslararası taşımacılık (Türkiye çıkışlı veya varışlı) | KDV istisnası | Taşıma belgesi (CMR) dosyada saklanır |
| Uluslararası taşımacılığa bağlı yurt içi ön taşıma | KDV istisnası | Tek sözleşme ve CMR ile bağlantılı olmalı |
| Gümrük müşavirliği hizmeti (yansıtma) | %20 KDV | GmbH faturası ayrıca değerlendirilir |

İstisna uygulanan her faturada istisna kodu e-Fatura'da doğru seçilmelidir. İstisna kodu hatalı faturalar, Muhasebe Müdürü onayıyla iptal edilip yeniden düzenlenir.

## 3. Fatura düzenleme süreleri

- Taşıma hizmeti faturaları, teslimatın tamamlandığı ve teslim belgesinin (POD) AtlasTMS'e yüklendiği tarihten itibaren **en geç 7 gün** içinde düzenlenir.
- Depolama faturaları her ayın son günü itibarıyla, izleyen ayın **3. iş günü** sonuna kadar düzenlenir.
- Aylık toplu fatura talep eden müşterilerde fatura ayın son günü tarihli olarak düzenlenir.

## 4. e-Fatura ve e-Arşiv

| Durum | Belge türü |
|---|---|
| Alıcı e-Fatura mükellefi | e-Fatura |
| Alıcı e-Fatura mükellefi değil | e-Arşiv fatura |
| Yurt dışındaki alıcı (ör. Atlas Lojistik GmbH dışındaki AB müşterileri) | e-Arşiv fatura (yurt dışı) |

e-Fatura mükellefiyeti, fatura düzenlenmeden önce AtlasERP'deki mükellef sorgulama ekranından kontrol edilir. Müşteri ana verisindeki bilgi 6 ayda bir otomatik olarak güncellenir.

## 5. Alış faturaları

1. Gelen e-Faturalar AtlasERP'ye otomatik aktarılır ve satın alma siparişiyle eşleştirilir.
2. Sipariş ve mal kabul ile eşleşmeyen faturalar "bekleyen faturalar" kuyruğuna düşer; kuyruktaki faturalar **5 iş günü** içinde ilgili birime sorulur.
3. Ticari faturalara 8 gün içinde itiraz edilebildiği için, hatalı faturalar alındığı gün içinde ilgili birime iletilir.
4. Taşeron taşıyıcı faturaları AtlasTMS'teki sefer kayıtlarıyla kontrol edilir; sefer kaydı bulunmayan faturalar ödenmez.

## 6. Kur farkı faturaları

EUR cinsinden kesilen satış faturalarında tahsilat tarihindeki kur ile fatura tarihindeki kur arasındaki fark **5.000 TL**'yi aşarsa, müşteriye kur farkı faturası düzenlenir. 5.000 TL ve altındaki farklar için kur farkı faturası düzenlenmez; fark doğrudan kur farkı hesabına kaydedilir.

## 7. Ay sonu kontrolleri

| Kontrol | Zaman |
|---|---|
| Kesilmemiş taşıma faturaları listesi (POD yüklenmiş, faturası yok) | İş günü 1 |
| İstisna kodlu faturaların CMR kontrolü | İş günü 2 |
| KDV hesaplarının mutabakatı | İş günü 4 |
| e-Fatura ret ve iptal listesi | İş günü 4 |

Kesilmemiş fatura listesi, "Month-End Close Procedure" belgesindeki gelir tahakkuku için de kullanılır.

## 8. Arşiv

e-Fatura ve e-Arşiv belgeleri AtlasERP arşivinde **10 yıl** saklanır. CMR belgeleri ve istisna dosyaları da aynı süreyle elektronik olarak arşivlenir.

## 9. İletişim

Muhasebe ekibi: muhasebe@atlas-lojistik.test, Vergi Müdürü: vergi@atlas-lojistik.test.
