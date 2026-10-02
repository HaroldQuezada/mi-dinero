// Modelos de presentación reutilizados por los componentes compartidos

export interface OpcionSelect<T extends string = string> {
  readonly valor: T;
  readonly etiqueta: string;
}

export interface TabItem<T extends string> {
  readonly id: T;
  readonly etiqueta: string;
}

export type EstadoBarra = 'normal' | 'ok' | 'advertencia' | 'excedido';

export type VarianteToggle = 'positivo' | 'negativo' | 'neutro';

export interface OpcionToggle<T extends string> extends OpcionSelect<T> {
  readonly variante?: VarianteToggle;
}
