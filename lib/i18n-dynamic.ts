type Locale = "pt-BR" | "fr" | "it";

type Forms = [singular: string, plural: string];
type DynamicConfig = {
  nouns: Record<
    "transaction" | "wallet" | "category" | "split" | "column",
    Forms
  >;
  selectedTransactions: Forms;
  customPositions: Forms;
  activeTransactions: Forms;
  selection: (selected: string, total: string) => string;
  splitSelected: (count: string) => string;
  positionDescription: (index: string) => string;
  positionAmount: (index: string) => string;
  removePosition: (index: string) => string;
  removeNamed: (name: string) => string;
  selectedCategories: (names: string) => string;
  startingAmount: (currency: string) => string;
  selectTransaction: (id: string) => string;
  categoryIcon: (id: string) => string;
  pieChart: (currency: string) => string;
  deleteTitle: (title: string) => string;
  page: (page: string, pages: string) => string;
  range: (from: string, to: string, total: string) => string;
};

const configs: Record<Locale, DynamicConfig> = {
  "pt-BR": {
    nouns: {
      transaction: ["transação", "transações"],
      wallet: ["carteira", "carteiras"],
      category: ["categoria", "categorias"],
      split: ["rateio", "rateios"],
      column: ["coluna", "colunas"],
    },
    selectedTransactions: ["transação selecionada", "transações selecionadas"],
    customPositions: ["item personalizado", "itens personalizados"],
    activeTransactions: ["transação ativa", "transações ativas"],
    selection: (selected, total) => `${selected} de ${total} selecionados`,
    splitSelected: (count) => `Ratear selecionadas (${count})`,
    positionDescription: (index) => `Descrição do item ${index}`,
    positionAmount: (index) => `Valor do item ${index}`,
    removePosition: (index) => `Remover item ${index}`,
    removeNamed: (name) => `Remover ${name}`,
    selectedCategories: (names) => `Categorias selecionadas: ${names}`,
    startingAmount: (currency) => `Saldo inicial em ${currency}`,
    selectTransaction: (id) => `Selecionar transação ${id}`,
    categoryIcon: (id) => `Ícone da categoria ${id}`,
    pieChart: (currency) => `Gráfico de pizza de gastos em ${currency}`,
    deleteTitle: (title) =>
      `Excluir “${title}”? Esta ação não pode ser desfeita.`,
    page: (page, pages) => `Página ${page} de ${pages}`,
    range: (from, to, total) => `${from}–${to} de ${total}`,
  },
  fr: {
    nouns: {
      transaction: ["transaction", "transactions"],
      wallet: ["portefeuille", "portefeuilles"],
      category: ["catégorie", "catégories"],
      split: ["répartition", "répartitions"],
      column: ["colonne", "colonnes"],
    },
    selectedTransactions: [
      "transaction sélectionnée",
      "transactions sélectionnées",
    ],
    customPositions: ["élément personnalisé", "éléments personnalisés"],
    activeTransactions: ["transaction active", "transactions actives"],
    selection: (selected, total) => `${selected} sur ${total} sélectionnés`,
    splitSelected: (count) => `Répartir la sélection (${count})`,
    positionDescription: (index) => `Description de l’élément ${index}`,
    positionAmount: (index) => `Montant de l’élément ${index}`,
    removePosition: (index) => `Supprimer l’élément ${index}`,
    removeNamed: (name) => `Supprimer ${name}`,
    selectedCategories: (names) => `Catégories sélectionnées : ${names}`,
    startingAmount: (currency) => `Montant initial en ${currency}`,
    selectTransaction: (id) => `Sélectionner la transaction ${id}`,
    categoryIcon: (id) => `Icône de catégorie ${id}`,
    pieChart: (currency) => `Diagramme circulaire des dépenses en ${currency}`,
    deleteTitle: (title) =>
      `Supprimer « ${title} » ? Cette action est irréversible.`,
    page: (page, pages) => `Page ${page} sur ${pages}`,
    range: (from, to, total) => `${from}–${to} sur ${total}`,
  },
  it: {
    nouns: {
      transaction: ["transazione", "transazioni"],
      wallet: ["portafoglio", "portafogli"],
      category: ["categoria", "categorie"],
      split: ["ripartizione", "ripartizioni"],
      column: ["colonna", "colonne"],
    },
    selectedTransactions: [
      "transazione selezionata",
      "transazioni selezionate",
    ],
    customPositions: ["voce personalizzata", "voci personalizzate"],
    activeTransactions: ["transazione attiva", "transazioni attive"],
    selection: (selected, total) => `${selected} di ${total} selezionati`,
    splitSelected: (count) => `Ripartisci selezionate (${count})`,
    positionDescription: (index) => `Descrizione della voce ${index}`,
    positionAmount: (index) => `Importo della voce ${index}`,
    removePosition: (index) => `Rimuovi la voce ${index}`,
    removeNamed: (name) => `Rimuovi ${name}`,
    selectedCategories: (names) => `Categorie selezionate: ${names}`,
    startingAmount: (currency) => `Importo iniziale in ${currency}`,
    selectTransaction: (id) => `Seleziona la transazione ${id}`,
    categoryIcon: (id) => `Icona categoria ${id}`,
    pieChart: (currency) => `Grafico a torta delle spese in ${currency}`,
    deleteTitle: (title) =>
      `Eliminare «${title}»? Questa operazione non può essere annullata.`,
    page: (page, pages) => `Pagina ${page} di ${pages}`,
    range: (from, to, total) => `${from}–${to} di ${total}`,
  },
};

function form(forms: Forms, count: string) {
  return forms[Number(count) === 1 ? 0 : 1];
}

export function translateDynamicUi(locale: Locale, text: string): string {
  const c = configs[locale];
  let match = text.match(
    /^(\d+) (transaction|transactions|wallet|wallets|category|categories|split|splits|column|columns)$/,
  );
  if (match) {
    const kind =
      (
        {
          transactions: "transaction",
          wallets: "wallet",
          categories: "category",
          splits: "split",
          columns: "column",
        } as Record<string, keyof DynamicConfig["nouns"]>
      )[match[2]] ?? (match[2] as keyof DynamicConfig["nouns"]);
    return `${match[1]} ${form(c.nouns[kind], match[1])}`;
  }
  match = text.match(/^(\d+) selected transactions?$/);
  if (match) return `${match[1]} ${form(c.selectedTransactions, match[1])}`;
  match = text.match(/^(· )?(\d+) custom positions?$/);
  if (match)
    return `${match[1] ?? ""}${match[2]} ${form(c.customPositions, match[2])}`;
  match = text.match(/^(\d+) active transactions?$/);
  if (match) return `${match[1]} ${form(c.activeTransactions, match[1])}`;
  match = text.match(/^(\d+) of (\d+) selected$/);
  if (match) return c.selection(match[1], match[2]);
  match = text.match(/^Split selected \((\d+)\)$/);
  if (match) return c.splitSelected(match[1]);
  match = text.match(/^Position (\d+) description$/);
  if (match) return c.positionDescription(match[1]);
  match = text.match(/^Position (\d+) amount$/);
  if (match) return c.positionAmount(match[1]);
  match = text.match(/^Remove position (\d+)$/);
  if (match) return c.removePosition(match[1]);
  match = text.match(/^Remove (.+)$/);
  if (match) return c.removeNamed(match[1]);
  match = text.match(/^Selected categories: (.+)$/);
  if (match) return c.selectedCategories(match[1]);
  match = text.match(/^Starting amount in (.+)$/);
  if (match) return c.startingAmount(match[1]);
  match = text.match(/^Select transaction (\d+)$/);
  if (match) return c.selectTransaction(match[1]);
  match = text.match(/^Category icon (\d+)$/);
  if (match) return c.categoryIcon(match[1]);
  match = text.match(/^(.+) spending pie chart$/);
  if (match) return c.pieChart(match[1]);
  match = text.match(/^Delete "(.+)"\? This cannot be undone\.$/);
  if (match) return c.deleteTitle(match[1]);
  match = text.match(/^Page (\d+) of (\d+)$/);
  if (match) return c.page(match[1], match[2]);
  match = text.match(/^(\d+)[–-](\d+) of (\d+)$/);
  if (match) return c.range(match[1], match[2], match[3]);
  return text;
}
