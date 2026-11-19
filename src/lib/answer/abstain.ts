// Abstention answers are templates, never model output: when nothing the
// user may read clears the calibrated threshold, the answer model is not
// called at all.

const OWNERS: { re: RegExp; tr: string; en: string }[] = [
  { re: /izin|maaş|maas|bordro|işe alım|ise alim|performans|leave|salary|payroll|hiring|vacation|holiday/i, tr: "İnsan Kaynakları", en: "HR" },
  { re: /vpn|şifre|sifre|parola|laptop|bilgisayar|e-?posta|mfa|password|computer|email|software|yazılım|yazilim/i, tr: "Bilgi Teknolojileri", en: "IT" },
  { re: /masraf|fatura|ödeme|odeme|harcırah|harcirah|bütçe|butce|expense|invoice|payment|per diem|budget/i, tr: "Finans", en: "Finance" },
  { re: /müşteri|musteri|teklif|indirim|satış|satis|customer|quote|discount|sales|pricing/i, tr: "Satış", en: "Sales" },
  { re: /depo|araç|arac|filo|sevkiyat|forklift|warehouse|vehicle|fleet|shipment|driver|sürücü|surucu/i, tr: "Operasyon", en: "Operations" },
];

export function owningDepartment(question: string, lang: "tr" | "en"): string | null {
  const hit = OWNERS.find((o) => o.re.test(question));
  return hit ? hit[lang] : null;
}

export function abstentionText(question: string, lang: "tr" | "en"): string {
  const dept = owningDepartment(question, lang);
  if (lang === "tr") {
    return `Erişebildiğiniz belgelerde bunu bulamadım.${dept ? ` Bu konuda ${dept} departmanına danışabilirsiniz.` : ""}`;
  }
  return `I couldn't find this in the documents you can access.${dept ? ` The ${dept} department may be able to help.` : ""}`;
}
