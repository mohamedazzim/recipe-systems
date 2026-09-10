import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeWorkspace } from '@/components/app/RecipeWorkspace';
import { recordSessionRecipe } from '@/lib/flow';
import { api, ApiError } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

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
    // The mount effect fetches the latest analysis — reject it as a 404 by default.
    (api as jest.Mock).mockReset();
    (api as jest.Mock).mockRejectedValue(new ApiError(404, 'ANALYSIS_NOT_FOUND', 'Analysis not found'));
  });

  function props(overrides: Partial<Parameters<typeof RecipeWorkspace>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, onBack: jest.fn(), ...overrides };
  }

  it('shows the four sections and the session title', async () => {
    recordSessionRecipe('r1', 'Meen Kuzhambu', { kind: 'user', accountId: 'acc-1' });
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

  it('D-22: a library reopen uses the saved DB name even without a session record', async () => {
    render(
      <RecipeWorkspace
        {...props({ initialTitle: 'Coastal Tamil (Kanyakumari) style meen kuzhambu' })}
      />,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Coastal Tamil (Kanyakumari) style meen kuzhambu' }),
    ).toBeInTheDocument();
  });

  it('back returns to the recipe home', async () => {
    const p = props();
    render(<RecipeWorkspace {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /Back to your recipes/ }));
    expect(p.onBack).toHaveBeenCalled();
  });
});

describe('RecipeWorkspace — D-22 Save (D1)', () => {
  const apiMock = api as jest.Mock;

  beforeEach(() => {
    window.localStorage.clear();
    apiMock.mockReset();
    // Mount fetches the latest analysis — reject it as a 404 by default.
    apiMock.mockRejectedValue(new ApiError(404, 'ANALYSIS_NOT_FOUND', 'Analysis not found'));
  });

  function props(overrides: Partial<Parameters<typeof RecipeWorkspace>[0]> = {}) {
    return { recipeId: 'r1', signedIn: true, onBack: jest.fn(), ...overrides };
  }

  it('Save sends a PUT with a blank title omitted (the family default applies server-side)', async () => {
    apiMock.mockResolvedValue({
      recipe_id: 'r1',
      title: 'Coastal Tamil (Kanyakumari) style meen kuzhambu',
      saved_at: '2026-09-10T12:00:00.000Z',
      artifacts: { raw_input: true, photo: false, object: true, identification: true, analysis: true, timestamps: true },
    });
    render(<RecipeWorkspace {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(apiMock).toHaveBeenCalledWith('/recipes/r1/save', {
      method: 'PUT',
      body: '{}',
    });
    expect(await screen.findByText(/Saved as/)).toBeInTheDocument();
    expect(screen.getAllByText(/Coastal Tamil/).length).toBeGreaterThan(0);
    expect(screen.getByText(/raw input ✓ · photo — · object ✓/)).toBeInTheDocument();
  });

  it('Save forwards an editable name and updates the heading title', async () => {
    apiMock.mockResolvedValue({
      recipe_id: 'r1',
      title: 'Sunday fish curry',
      saved_at: '2026-09-10T12:00:00.000Z',
      artifacts: { raw_input: true, photo: false, object: true, identification: true, analysis: false, timestamps: true },
    });
    render(<RecipeWorkspace {...props()} />);
    await userEvent.type(screen.getByLabelText('Recipe name'), '  Sunday fish curry  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(apiMock).toHaveBeenCalledWith('/recipes/r1/save', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Sunday fish curry' }),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sunday fish curry' })).toBeInTheDocument();
  });

  it('a failed save surfaces the honest error and never shows a saved state', async () => {
    apiMock.mockRejectedValue(new ApiError(404, 'RECIPE_NOT_FOUND', 'Recipe not found'));
    render(<RecipeWorkspace {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument();
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument();
  });

  it('D6: delete needs an explicit second step — Cancel returns without calling the API', async () => {
    render(<RecipeWorkspace {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete recipe' }));
    expect(screen.getByText(/permanently removed/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/permanently removed/i)).not.toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalledWith('/recipes/r1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('D6: confirmed delete sends {confirm:true}, waits for the 204, then calls onDeleted', async () => {
    apiMock.mockResolvedValue(undefined); // the 204 path
    const p = props({ onDeleted: jest.fn() });
    render(<RecipeWorkspace {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete recipe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete recipe' })); // the confirmation button
    expect(apiMock).toHaveBeenCalledWith('/recipes/r1', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true }),
    });
    expect(p.onDeleted).toHaveBeenCalled();
  });

  it('D6: a failed delete keeps the recipe and surfaces the error (no optimistic removal)', async () => {
    apiMock.mockRejectedValue(new ApiError(503, 'HTTP_ERROR', 'Service unavailable'));
    const p = props({ onDeleted: jest.fn() });
    render(<RecipeWorkspace {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete recipe' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete recipe' }));
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    expect(p.onDeleted).not.toHaveBeenCalled();
    // the recipe remains: the save surface is still rendered
    expect(screen.getByRole('button', { name: 'Save recipe' })).toBeInTheDocument();
  });

  it('D6: guests never see the delete surface (Bearer-only per RS-US-24)', () => {
    render(<RecipeWorkspace {...props({ signedIn: false })} />);
    expect(screen.queryByRole('button', { name: 'Delete recipe' })).not.toBeInTheDocument();
  });
});
