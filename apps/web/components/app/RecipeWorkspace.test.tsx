import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeWorkspace } from '@/components/app/RecipeWorkspace';
import { recordSessionRecipe } from '@/lib/flow';

jest.mock('@/components/app/IngredientReview', () => ({
  IngredientReview: ({ title }: { title: string }) => <p>Review: {title}</p>,
}));
jest.mock('@/components/app/MethodSection', () => ({
  MethodSection: () => <p>Method section</p>,
}));
jest.mock('@/components/app/ReadinessPanel', () => ({
  ReadinessPanel: ({ onAnalysed }: { onAnalysed: (id: string) => void }) => (
    <button onClick={() => onAnalysed('a-1')}>Analyse now</button>
  ),
}));
jest.mock('@/components/app/AnalysisPanel', () => ({
  AnalysisPanel: ({ analysisId }: { analysisId: string | null }) => <p>Panel: {analysisId ?? 'none'}</p>,
}));

describe('RecipeWorkspace', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function props(overrides: Partial<Parameters<typeof RecipeWorkspace>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, onBack: jest.fn(), ...overrides };
  }

  it('shows the four sections and the session title', async () => {
    recordSessionRecipe('r1', 'Meen Kuzhambu');
    render(<RecipeWorkspace {...props()} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Meen Kuzhambu' })).toBeInTheDocument();
    expect(screen.getByText('Review: Meen Kuzhambu')).toBeInTheDocument();
    expect(screen.getByText('Method section')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse now' })).toBeInTheDocument();
    expect(screen.getByText('Panel: none')).toBeInTheDocument();
  });

  it('passes the enqueued analysis id down to the status panel', async () => {
    render(<RecipeWorkspace {...props()} />);
    await screen.findByRole('button', { name: 'Analyse now' });
    await userEvent.click(screen.getByRole('button', { name: 'Analyse now' }));
    expect(await screen.findByText('Panel: a-1')).toBeInTheDocument();
  });

  it('back returns to the recipe home', async () => {
    const p = props();
    render(<RecipeWorkspace {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Back to your recipes/ }));
    expect(p.onBack).toHaveBeenCalled();
  });
});
